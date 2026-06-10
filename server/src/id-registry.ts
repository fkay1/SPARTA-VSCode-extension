export interface IdRegistry {
  fix: string[];
  compute: string[];
  region: string[];
  surf_collide: string[];
  surf_react: string[];
}

export function createEmptyIdRegistry(): IdRegistry {
  return {
    fix: [],
    compute: [],
    region: [],
    surf_collide: [],
    surf_react: [],
  };
}
