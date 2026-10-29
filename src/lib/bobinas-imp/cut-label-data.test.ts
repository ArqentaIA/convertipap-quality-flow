import { describe, expect, it } from 'vitest';
import { cintaOrigen, cintaOrigenLabel, impCutLabelVariables } from './cut-label-data';

describe('etiqueta de corte importado', () => {
  it('identifica el vínculo importado aunque el origen legado sea manual', () => {
    expect(cintaOrigen({imp_bobina_id:'importada',origen_rollo:'captura_manual'})).toBe('importada');
    expect(cintaOrigenLabel('importada')).toBe('Bobinas Madre Imp');
  });
  it('extrae exactamente las seis variables del respaldo de origen', () => {
    expect(impCutLabelVariables({valores:{peso_base:49.7,r457:32.6,a:1.69,b:7.27,peso_bobina:2118,ancho_util:261}}).map(v=>[v.key,v.value])).toEqual([
      ['peso_base',49.7],['r457',32.6],['a',1.69],['b',7.27],['peso_bobina',2118],['ancho_util',261],
    ]);
  });
  it('conserva cero y deja ausentes sin inventar valores', () => {
    const variables=impCutLabelVariables({valores:{a:0,b:null,peso_base:'49.7'}});
    expect(variables.find(v=>v.key==='a')?.value).toBe(0);
    expect(variables.find(v=>v.key==='b')?.value).toBeNull();
    expect(variables.find(v=>v.key==='peso_base')?.value).toBeNull();
    expect(impCutLabelVariables(null).map(v=>v.value)).toEqual([null,null,null,null,null,null]);
  });
  it('conserva la clasificación de fabricación y captura manual', () => {
    expect(cintaOrigen({muestra_calidad_id:'fabricada'})).toBe('sistema');
    expect(cintaOrigen({})).toBe('captura_manual');
  });
});