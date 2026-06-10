/** Style-specific argument snippets (args only, after command ID style). */
export const STYLE_ARG_SNIPPETS: Record<string, Record<string, string>> = {
  fix: {
    'grid/check': '${1:100} ${2|warn,error|}',
    adapt: '${1:10}',
    'ave/grid': '${1:all} ${2:100} ${3:5} ${4:1000} ${5:c_1}',
    'ave/time': '${1:all} ${2:100} ${3:5} ${4:1000} ${5:c_1}',
    'ave/surf': '${1:all} ${2:100} ${3:5} ${4:1000} ${5:c_1}',
    'emit/face': '${1:air} ${2|all,xlo,xhi,ylo,yhi,zlo,zhi|}',
    'emit/face/file': '${1:air} ${2|xlo,xhi,ylo,yhi,zlo,zhi|} ${3:flow.face} ${4:boundaryID}',
    halt: '${1:100} ${2:timestep} ${3:>} ${4:1000}',
    'dt/reset': '${1:10} ${2:0.01} ${3:1.0} ${4:1}',
    ablate: '${1:all} ${2:100} ${3:1.0} ${4:source}',
    balance: '${1:100} ${2:1.1} ${3|rcb,block|} ${4:cell}',
  },
  compute: {
    grid: '${1:all} ${2|n,id,vol,mass|}',
    temp: '${1:all}',
    'ke/particle': '${1:all}',
    boundary: '${1:all}',
    'gas/collision/grid': '${1:all} ${2:all}',
    reduce: '${1:sum} ${2:c_1}',
  },
  region: {
    block: '${1:0} ${2:10} ${3:0} ${4:10} ${5:-0.5} ${6:0.5}',
    cylinder: '${1|x,y,z|} ${2:0} ${3:0} ${4:5} ${5:-5} ${6:5}',
    sphere: '${1:0} ${2:0} ${3:0} ${4:5}',
    plane: '${1:0} ${2:0} ${3:0} ${4:1} ${5:0} ${6:0}',
  },
  surf_collide: {
    diffuse: '${1:300.0} ${2:1.0}',
    specular: '',
    adiabatic: '',
    piston: '${1:300.0}',
    cll: '${1:300.0} ${2:1.0} ${3:1.0} ${4:1.0} ${5:1.0}',
  },
  surf_react: {
    global: '${1:0.0} ${2:0.0}',
    prob: '${1:air.surf}',
    adsorb: '${1|gs,ps,gs/ps|} ${2:infile} ${3:100} ${4:1} ${5:300} ${6:1.0e15}',
  },
  collide: {
    vss: '${1:air} ${2:air.vss}',
    none: '',
  },
  react: {
    tce: '${1:air.tce}',
    'tce/qk': '${1:air.tce}',
    none: '',
  },
};

export function getStyleArgSnippet(family: string, style: string): string | undefined {
  const familySnippets = STYLE_ARG_SNIPPETS[family];
  if (!familySnippets) {
    return undefined;
  }
  if (familySnippets[style]) {
    return familySnippets[style];
  }
  const normalized = style.replace(/\/kk$/, '');
  return familySnippets[normalized];
}
