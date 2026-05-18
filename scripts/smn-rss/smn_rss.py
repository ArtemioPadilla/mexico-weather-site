#!/usr/bin/env python3
"""
smn_rss.py — Genera un feed RSS 2.0 con alertas y comunicados del SMN (Servicio Meteorológico Nacional).

Consolidado desde el repo `mexico-weather`
------------------------------------------
Este scraper fue portado SIN cambios en su lógica de scraping ni en su
atribución de fuentes desde el repositorio `mexico-weather`. La única
adaptación para `mexico-weather-site` es que la ruta de salida por defecto
ahora apunta a `src/data/smn-feed.xml` (relativa a la raíz del repo,
resuelta de forma independiente al directorio de trabajo) y que el número
de items se imprime a stdout. Es de uso exclusivo en CI (Python/Playwright
no son dependencias del sitio Astro); ver `.github/workflows/smn-rss.yml`.

Fuentes scrapeadas con Playwright (JS-hydrated pages):
  - Home del SMN: alertas activas + comunicados de prensa con link al PDF
  - Pronóstico Meteorológico General: texto completo del aviso nacional
  - Aviso de Potencial de Tormentas: emisión actual
  - Pronóstico por municipio (opcional, vía --municipio ID)

Salida:
  - src/data/smn-feed.xml  (RSS 2.0; lo consume src/pages/rss.xml.ts en build)

Uso:
  python3 smn_rss.py                          # genera src/data/smn-feed.xml
  python3 smn_rss.py --out /path/rss.xml      # ruta personalizada
  python3 smn_rss.py --municipio 20274        # incluye pronóstico de Oaxaca (ID SMN)
  python3 smn_rss.py --municipios 20274,9002  # varios municipios

IDs comunes de municipios:
  9002  = Ciudad de México (Cuauhtémoc)
  14039 = Guadalajara
  19039 = Monterrey
  20274 = Oaxaca de Juárez
  20530 = San Pablo Etla, Oaxaca
  23001 = Cancún
  6003  = Colima
"""

import argparse
import hashlib
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)

# ─── Constants ────────────────────────────────────────────────────────────────

SMN_BASE = "https://smn.conagua.gob.mx"
SMN_HOME = f"{SMN_BASE}/es/"
SMN_GENERAL = f"{SMN_BASE}/es/pronosticos/pronosticossubmenu/pronostico-meteorologico-general"
SMN_TORMENTAS = f"{SMN_BASE}/es/pronosticos/avisos/aviso-de-potencial-de-tormentas"
SMN_MUNICIPIO = f"{SMN_BASE}/es/pronosticos/pronostico-de-ciudad?id={{municipio_id}}"

FEED_TITLE = "SMN — Alertas y Pronósticos México"
FEED_DESCRIPTION = (
    "Alertas meteorológicas, comunicados de prensa y pronósticos del "
    "Servicio Meteorológico Nacional (SMN / Conagua), México."
)
FEED_LINK = SMN_HOME
FEED_LANGUAGE = "es-mx"
FEED_TTL = "60"  # minutes

# UTC-6 for display
MX_TZ = timezone(timedelta(hours=-6))

# ─── Browser helpers ──────────────────────────────────────────────────────────

def _new_page(browser):
    return browser.new_page(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    )


def _fetch_page(browser, url: str, extra_wait_ms: int = 2500) -> str:
    """Navigate to URL, wait for load + extra JS hydration, return HTML."""
    page = _new_page(browser)
    try:
        page.goto(url, wait_until="load", timeout=45_000)
        page.wait_for_timeout(extra_wait_ms)
        html = page.content()
        return html
    except PWTimeoutError:
        # Fallback: grab whatever loaded so far
        try:
            return page.content()
        except Exception:
            return ""
    finally:
        page.close()


def _inner_text(browser, url: str, extra_wait_ms: int = 2500) -> str:
    """Return document.body.innerText from a page."""
    page = _new_page(browser)
    try:
        page.goto(url, wait_until="load", timeout=45_000)
        page.wait_for_timeout(extra_wait_ms)
        return page.evaluate("document.body.innerText") or ""
    except PWTimeoutError:
        try:
            return page.evaluate("document.body.innerText") or ""
        except Exception:
            return ""
    finally:
        page.close()


# ─── Parsers ─────────────────────────────────────────────────────────────────

def _strip_tags(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    return " ".join(re.sub(r"<[^>]+>", " ", html).split())


def _parse_smn_date(date_str: str) -> datetime:
    """
    Parse SMN date strings like '15 MAY 2026' or '16 de mayo del 2026'.
    Returns a datetime in MX_TZ; falls back to now if unparseable.
    """
    MONTHS_ES = {
        "ene": 1, "enero": 1,
        "feb": 2, "febrero": 2,
        "mar": 3, "marzo": 3,
        "abr": 4, "abril": 4,
        "may": 5, "mayo": 5,
        "jun": 6, "junio": 6,
        "jul": 7, "julio": 7,
        "ago": 8, "agosto": 8,
        "sep": 9, "septiembre": 9, "sept": 9,
        "oct": 10, "octubre": 10,
        "nov": 11, "noviembre": 11,
        "dic": 12, "diciembre": 12,
    }
    s = date_str.strip().lower()
    # "15 may 2026" or "15 mayo 2026" or "15 de mayo del 2026"
    m = re.search(r"(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)(?:\s+del?)?\s+(\d{4})", s)
    if m:
        day, mon_str, year = int(m.group(1)), m.group(2)[:3], int(m.group(3))
        month = MONTHS_ES.get(mon_str, 0)
        if month:
            return datetime(year, month, day, 12, 0, tzinfo=MX_TZ)
    return datetime.now(MX_TZ)


# ─── Scrapers ─────────────────────────────────────────────────────────────────

def scrape_home(browser) -> list[dict]:
    """
    Scrape the SMN homepage.

    Returns list of feed items, each dict with keys:
      title, link, description, pub_date (datetime), guid
    """
    items = []
    html = _fetch_page(browser, SMN_HOME)

    if not html:
        return items

    # 1. Main active alert banner ─────────────────────────────────────────────
    #    id="index_AlertaSistemaFrontalTitulo" (appears twice; dedupe)
    seen_alerts = set()
    alert_titles = re.findall(
        r'id=["\']?index_AlertaSistemaFrontalTitulo["\']?[^>]*>(.*?)</(?:SPAN|span)>',
        html, re.S | re.I
    )
    alert_content_matches = re.findall(
        r'id=["\']?index_AlertasistemaFrontalContenido(?:_2)?["\']?[^>]*>(.*?)</p>',
        html, re.S | re.I
    )

    # Dedupe alerts (homepage renders them twice)
    unique_titles = list(dict.fromkeys(
        re.sub(r'\s+', ' ', _strip_tags(t)).strip() for t in alert_titles if t.strip()
    ))
    unique_contents = list(dict.fromkeys(
        re.sub(r'\s+', ' ', _strip_tags(c)).strip() for c in alert_content_matches if c.strip()
    ))

    if unique_titles:
        title_text = "; ".join(unique_titles)
        body_text = " | ".join(unique_contents) if unique_contents else ""
        alert_text = body_text or title_text
        fecha = datetime.now(MX_TZ).strftime("%Y-%m-%d")
        hash4 = hashlib.md5(alert_text.encode()).hexdigest()[:4]
        guid = f"smn-alert-{fecha}-{hash4}"

        if guid not in seen_alerts:
            seen_alerts.add(guid)
            items.append({
                "title": f"⚠️ Alerta SMN: {title_text}",
                "link": SMN_HOME,
                "description": alert_text,
                "pub_date": datetime.now(MX_TZ),
                "guid": guid,
                "category": "Alerta",
            })

    # 2. Comunicados de prensa / reportes ─────────────────────────────────────
    #    onclick="window.open('/files/pdfs/comunicados-de-prensa/Reporte...pdf')"
    news_raw = re.findall(
        r'''onclick="[^"]*(/files/pdfs/[^"']+\.pdf)['"]\s*[^>]*>'''
        r'''.*?\[(\d{1,2}\s+\w+\s+\d{4})\]'''
        r'''.*?<li>(.*?)</li>''',
        html, re.S | re.I
    )
    seen_news = set()
    for pdf_path, date_str, title_html in news_raw:
        clean_title = re.sub(r'\s+', ' ', _strip_tags(title_html)).strip()
        # Clean stray JS from pdf_path
        pdf_path = re.sub(r"['\",].*", "", pdf_path).strip()
        pdf_url = f"{SMN_BASE}{pdf_path}"
        guid = f"smn-comunicado-{pdf_path.split('/')[-1].replace('.pdf', '')}"

        if guid in seen_news:
            continue
        seen_news.add(guid)

        # Determine report type from filename (before parsing date for timestamp adjustment)
        fname = pdf_path.lower()
        if "vespertino" in fname:
            tipo = "Reporte Vespertino"
        elif "matutino" in fname:
            tipo = "Reporte Matutino"
        elif "especial" in fname:
            tipo = "Reporte Especial"
        else:
            tipo = "Comunicado"

        pub_date = _timestamp_from_tipo(fname, _parse_smn_date(date_str))

        items.append({
            "title": f"📋 SMN {tipo} {date_str}: {clean_title}",
            "link": pdf_url,
            "description": (
                f"{clean_title} — {tipo} del {date_str}. "
                f"Descarga el PDF: {pdf_url}"
            ),
            "pub_date": pub_date,
            "guid": guid,
            "category": "Comunicado",
        })

    return items


def scrape_pronostico_general(browser) -> list[dict]:
    """
    Scrape the Pronóstico Meteorológico General page.
    Returns a single feed item with the full forecast text.
    """
    text = _inner_text(browser, SMN_GENERAL)
    if not text.strip():
        return []

    # Strip navigation boilerplate (ends at 'Descargar en PDF')
    # The actual content starts after the nav
    match = re.search(
        r'(Pronóstico Meteorológico General.*?)'
        r'(?:Está aquí:|Links|Datos|Portal de Obligaciones)',
        text, re.S | re.I
    )
    if match:
        content = match.group(1).strip()
    else:
        # Fallback: skip first 400 chars of nav noise
        content = text[400:].strip()

    # Extract date and aviso number
    date_match = re.search(r'Ciudad de México[,\s]+a?\s*(\d{1,2}\s+de\s+\w+\s+del?\s+\d{4})', content, re.I)
    aviso_match = re.search(r'No\.?\s*Aviso[:\s]+(\d+)', content, re.I)
    emision_match = re.search(r'Emisión[:\s]+(\d{1,2}:\d{2})h?', content, re.I)

    date_str = date_match.group(1) if date_match else ""
    aviso_num = aviso_match.group(1) if aviso_match else ""
    emision = emision_match.group(1) if emision_match else ""

    pub_date = _parse_smn_date(date_str) if date_str else datetime.now(MX_TZ)

    title_suffix = []
    if aviso_num:
        title_suffix.append(f"No. {aviso_num}")
    if date_str:
        title_suffix.append(date_str)
    if emision:
        title_suffix.append(f"Emisión {emision}h")

    title = "🌩️ Pronóstico Meteorológico General — SMN"
    if title_suffix:
        title += " | " + " | ".join(title_suffix)

    # Grab the headline in ALL CAPS (the summary line)
    headlines = re.findall(r'\b([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s,]+[A-ZÁÉÍÓÚÜÑ])\b', content)
    long_headlines = [h.strip() for h in headlines if len(h.strip()) > 40][:3]

    summary = " • ".join(long_headlines) if long_headlines else content[:300]

    guid_date = pub_date.strftime("%Y-%m-%d")
    guid_aviso = f"-{aviso_num}" if aviso_num else ""
    guid = f"smn-pronostico-general-{guid_date}{guid_aviso}"

    return [{
        "title": title,
        "link": SMN_GENERAL,
        "description": f"{summary}\n\n---\n{_truncate(content)}",
        "pub_date": pub_date,
        "guid": guid,
        "category": "Pronóstico General",
    }]


def scrape_potencial_tormentas(browser) -> list[dict]:
    """
    Scrape the Aviso de Potencial de Tormentas page.
    Returns a single feed item.
    """
    text = _inner_text(browser, SMN_TORMENTAS)
    if not text.strip():
        return []

    match = re.search(
        r'(Aviso de Potencial de Tormentas.*?)'
        r'(?:Está aquí:|Links|Datos|Portal de Obligaciones)',
        text, re.S | re.I
    )
    content = match.group(1).strip() if match else text[400:1800].strip()

    # Skip if content is empty or just a header (< 100 useful chars after stripping header)
    useful = re.sub(r'^Aviso de Potencial de Tormentas\s*', '', content, flags=re.I).strip()
    if len(useful) < 100:
        return []

    date_match = re.search(r'Ciudad de México[,\s]+(\d{1,2}\s+de\s+\w+\s+del?\s+\d{4})', content, re.I)
    emision_match = re.search(r'Emisión[:\s]+(\d{1,2}:\d{2})', content, re.I)

    date_str = date_match.group(1) if date_match else ""
    emision = emision_match.group(1) if emision_match else ""
    pub_date = _parse_smn_date(date_str) if date_str else datetime.now(MX_TZ)

    title = "⛈️ Aviso de Potencial de Tormentas — SMN"
    if date_str:
        title += f" | {date_str}"
    if emision:
        title += f" | Emisión {emision}h"

    guid_date = pub_date.strftime("%Y-%m-%d-%H")
    guid = f"smn-potencial-tormentas-{guid_date}"

    return [{
        "title": title,
        "link": SMN_TORMENTAS,
        "description": _truncate(content),
        "pub_date": pub_date,
        "guid": guid,
        "category": "Aviso Tormentas",
    }]


def scrape_municipio(browser, municipio_id: str) -> list[dict]:
    """
    Scrape the municipal forecast page for a given SMN municipio ID.
    Returns a single feed item or empty list on failure.
    """
    url = SMN_MUNICIPIO.format(municipio_id=municipio_id)
    text = _inner_text(browser, url)
    if not text.strip() or "404" in text[:100]:
        print(f"  ⚠️  Municipio {municipio_id}: página no encontrada", file=sys.stderr)
        return []

    # Try to extract municipality name from title/heading
    name_match = re.search(r'Pronóstico para\s+(.+?)(?:\n|\r|$)', text, re.I)
    mun_name = name_match.group(1).strip() if name_match else f"Municipio {municipio_id}"

    # Try date
    date_match = re.search(r'(\d{1,2}\s+de\s+\w+\s+del?\s+\d{4})', text, re.I)
    date_str = date_match.group(1) if date_match else ""
    pub_date = _parse_smn_date(date_str) if date_str else datetime.now(MX_TZ)

    # Content block
    match = re.search(
        r'(Pronóstico para.*?)'
        r'(?:Está aquí:|Links|Datos|Portal de Obligaciones)',
        text, re.S | re.I
    )
    content = match.group(1).strip() if match else text[300:1500].strip()

    guid_date = pub_date.strftime("%Y-%m-%d")
    guid = f"smn-municipio-{municipio_id}-{guid_date}"

    return [{
        "title": f"📍 Pronóstico SMN: {mun_name}",
        "link": url,
        "description": _truncate(content),
        "pub_date": pub_date,
        "guid": guid,
        "category": "Municipio",
    }]


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _truncate(text: str, limit: int = 1200) -> str:
    """Truncate text cleanly at the last sentence boundary before limit."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last_period = max(cut.rfind('. '), cut.rfind('\n'))
    return (cut[:last_period + 1] if last_period > limit // 2 else cut) + '…'


def _timestamp_from_tipo(text: str, base_date: datetime) -> datetime:
    """Adjust pub_date hour based on Matutino/Vespertino clue in text."""
    lower = text.lower()
    if 'matutino' in lower:
        return base_date.replace(hour=7, minute=0, second=0, microsecond=0)
    elif 'vespertino' in lower:
        return base_date.replace(hour=17, minute=0, second=0, microsecond=0)
    return base_date.replace(hour=12, minute=0, second=0, microsecond=0)


# ─── RSS Builder ─────────────────────────────────────────────────────────────

def _cdata(text: str) -> str:
    """Wrap text in CDATA for safe XML embedding."""
    # Escape any ]]> sequences in content
    return f"<![CDATA[{text.replace(']]>', ']]]]><![CDATA[>')}]]>"


def build_rss(items: list[dict], feed_url: str = "") -> str:
    """
    Build RSS 2.0 XML string from a list of item dicts.

    Each item must have: title, link, description, pub_date, guid
    Optional: category
    """
    now_rfc = format_datetime(datetime.now(timezone.utc))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        f'    <title>{FEED_TITLE}</title>',
        f'    <link>{FEED_LINK}</link>',
        f'    <description>{FEED_DESCRIPTION}</description>',
        f'    <language>{FEED_LANGUAGE}</language>',
        f'    <lastBuildDate>{now_rfc}</lastBuildDate>',
        f'    <ttl>{FEED_TTL}</ttl>',
        f'    <generator>smn_rss.py / ArtemIO</generator>',
    ]

    if feed_url:
        lines.append(f'    <atom:link href="{feed_url}" rel="self" type="application/rss+xml"/>')

    # Sort items newest-first
    sorted_items = sorted(items, key=lambda x: x["pub_date"], reverse=True)

    for item in sorted_items:
        pub_rfc = format_datetime(item["pub_date"])
        # Escape title/link for XML attributes
        title_esc = item["title"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        link_esc = item["link"].replace("&", "&amp;")
        guid_esc = item["guid"].replace("&", "&amp;")

        desc_cdata = _cdata(item["description"])
        category = item.get("category", "")

        lines += [
            "    <item>",
            f"      <title>{title_esc}</title>",
            f"      <link>{link_esc}</link>",
            f"      <description>{desc_cdata}</description>",
            f"      <pubDate>{pub_rfc}</pubDate>",
            f"      <guid isPermaLink=\"false\">{guid_esc}</guid>",
        ]
        if category:
            cat_esc = category.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            lines.append(f"      <category>{cat_esc}</category>")
        lines.append("    </item>")

    lines += [
        "  </channel>",
        "</rss>",
    ]

    return "\n".join(lines)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Genera un feed RSS 2.0 con alertas del SMN (Servicio Meteorológico Nacional)."
    )
    parser.add_argument(
        "--out", default=None,
        help="Ruta del archivo RSS de salida "
             "(default: <repo>/src/data/smn-feed.xml)"
    )
    parser.add_argument(
        "--municipio", default="",
        help="ID de municipio SMN para incluir pronóstico (ej: 20274 = Oaxaca de Juárez)"
    )
    parser.add_argument(
        "--municipios", default="",
        help="IDs de municipios separados por coma (ej: 20274,9002)"
    )
    parser.add_argument(
        "--feed-url", default="",
        help="URL pública del feed RSS (para la etiqueta atom:link self)"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Mostrar progreso detallado"
    )
    args = parser.parse_args()

    def log(msg):
        if args.verbose:
            print(msg, file=sys.stderr)

    # Collect municipio IDs
    mun_ids = []
    if args.municipio:
        mun_ids += [m.strip() for m in args.municipio.split(",") if m.strip()]
    if args.municipios:
        mun_ids += [m.strip() for m in args.municipios.split(",") if m.strip()]
    mun_ids = list(dict.fromkeys(mun_ids))  # dedupe preserve order

    all_items = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            log("🔍 Scraping home del SMN (alertas + comunicados)...")
            home_items = scrape_home(browser)
            all_items.extend(home_items)
            log(f"  → {len(home_items)} items")

            log("🌩️  Scraping Pronóstico Meteorológico General...")
            gen_items = scrape_pronostico_general(browser)
            all_items.extend(gen_items)
            log(f"  → {len(gen_items)} items")

            log("⛈️  Scraping Aviso de Potencial de Tormentas...")
            tort_items = scrape_potencial_tormentas(browser)
            all_items.extend(tort_items)
            log(f"  → {len(tort_items)} items")

            for mun_id in mun_ids:
                log(f"📍 Scraping municipio {mun_id}...")
                mun_items = scrape_municipio(browser, mun_id)
                all_items.extend(mun_items)
                log(f"  → {len(mun_items)} items")

        finally:
            browser.close()

    if not all_items:
        print("⚠️  No se obtuvieron items. El feed estará vacío.", file=sys.stderr)

    rss_xml = build_rss(all_items, feed_url=args.feed_url)

    if args.out:
        out_path = Path(args.out)
    else:
        # Default: <repo-root>/src/data/smn-feed.xml, resolved from this
        # file's location so it is independent of the current working dir.
        # scripts/smn-rss/smn_rss.py -> repo root is two parents up.
        repo_root = Path(__file__).resolve().parent.parent.parent
        out_path = repo_root / "src" / "data" / "smn-feed.xml"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(rss_xml, encoding="utf-8")

    # Item count to stdout (consumed by humans and the CI workflow log).
    print(f"item_count={len(all_items)}")
    print(f"✅ RSS generado: {out_path} ({len(all_items)} items)")
    if args.verbose:
        for item in sorted(all_items, key=lambda x: x["pub_date"], reverse=True):
            print(f"  [{item.get('category', '-')}] {item['title'][:80]}")


if __name__ == "__main__":
    main()
