import { IMP_VARIABLES } from './rules';

/** Read only the source snapshot captured with this cut, never manufacturing data. */
export function impCutLabelVariables(source: unknown) {
  const snapshot = source && typeof source === 'object' ? source as Record<string, unknown> : {};
  const raw = snapshot.valores;
  const values = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return IMP_VARIABLES.map(variable => {
    const value = values[variable.key];
    return {
      key: variable.key,
      label: variable.label,
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    };
  });
}

export function cintaOrigen(snapshot: { imp_bobina_id?: string | null; origen_rollo?: 'sistema' | 'captura_manual' | 'importada'; muestra_calidad_id?: string | null }) {
  if (snapshot.imp_bobina_id) return 'importada';
  return snapshot.origen_rollo ?? (snapshot.muestra_calidad_id ? 'sistema' : 'captura_manual');
}

export function cintaOrigenLabel(origen: ReturnType<typeof cintaOrigen>) {
  return origen === 'importada' ? 'Bobinas Madre Imp' : origen === 'sistema' ? 'Sistema' : 'Captura manual';
}