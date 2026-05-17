export interface FeedbackStrings {
  button_label: string;
  modal_title: string;
  type_label: string;
  type_bug: string;
  type_feature: string;
  type_question: string;
  type_translation: string;
  title_label: string;
  title_placeholder: string;
  description_label: string;
  description_placeholder: string;
  steps_label: string;
  steps_placeholder: string;
  expected_label: string;
  expected_placeholder: string;
  diagnostics_toggle: string;
  diagnostics_env: string;
  diagnostics_console: string;
  diagnostics_network: string;
  diagnostics_none: string;
  copy_diagnostics: string;
  copied: string;
  cancel: string;
  open_on_github: string;
  badge_errors_label: string;
}

export const feedback: Record<'es' | 'en', FeedbackStrings> = {
  es: {
    button_label: 'Reportar un problema',
    modal_title: 'Reportar un problema',
    type_label: 'Tipo',
    type_bug: 'Error',
    type_feature: 'Solicitud de funcionalidad',
    type_question: 'Pregunta',
    type_translation: 'Problema de traducción',
    title_label: 'Título',
    title_placeholder: 'Resumen corto del problema',
    description_label: 'Descripción',
    description_placeholder: '¿Qué pasó? ¿Qué esperabas?',
    steps_label: 'Pasos para reproducir',
    steps_placeholder: '1. Ir a…\n2. Hacer clic en…\n3. Ver error',
    expected_label: 'Comportamiento esperado',
    expected_placeholder: '¿Qué esperabas que pasara?',
    diagnostics_toggle: 'Mostrar diagnósticos',
    diagnostics_env: 'Entorno',
    diagnostics_console: 'Errores de consola',
    diagnostics_network: 'Peticiones fallidas',
    diagnostics_none: 'Ninguno capturado',
    copy_diagnostics: 'Copiar diagnósticos',
    copied: '¡Copiado!',
    cancel: 'Cancelar',
    open_on_github: 'Abrir en GitHub',
    badge_errors_label: 'errores detectados',
  },
  en: {
    button_label: 'Report an issue',
    modal_title: 'Report an issue',
    type_label: 'Type',
    type_bug: 'Bug',
    type_feature: 'Feature request',
    type_question: 'Question',
    type_translation: 'Translation issue',
    title_label: 'Title',
    title_placeholder: 'Short summary of the issue',
    description_label: 'Description',
    description_placeholder: 'What happened? What did you expect?',
    steps_label: 'Steps to reproduce',
    steps_placeholder: '1. Go to…\n2. Click on…\n3. See error',
    expected_label: 'Expected behavior',
    expected_placeholder: 'What did you expect to happen?',
    diagnostics_toggle: 'Show diagnostics',
    diagnostics_env: 'Environment',
    diagnostics_console: 'Console errors',
    diagnostics_network: 'Failed requests',
    diagnostics_none: 'None captured',
    copy_diagnostics: 'Copy diagnostics',
    copied: 'Copied!',
    cancel: 'Cancel',
    open_on_github: 'Open on GitHub',
    badge_errors_label: 'errors detected',
  },
};
