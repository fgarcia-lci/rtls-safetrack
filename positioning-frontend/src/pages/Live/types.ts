export interface PlantViewLayer {
  id: number;
  code: string;
  name: string;
  assetUrl: string;
  defaultVisible: boolean;
  displayOrder?: number | null;
  displayColor?: string | null;
}

export interface PlantView {
  id: number;
  plantId: string;
  code: string;
  name: string;
  type: 'MODEL_3D' | 'FLOORPLAN_2D';
  assetUrl: string;
  bbox?: string | null;
  defaultCamera?: string | null;
  defaultYOffset?: number | null;
  defaultAvatarHeightM?: number | null;
  displayOrder?: number | null;
  thumbnailUrl?: string | null;
  layers: PlantViewLayer[];
}
