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
  /** FLOORPLAN_2D: world bbox of the SVG (meters). Null for MODEL_3D. */
  worldBboxMinX?: number | null;
  worldBboxMinY?: number | null;
  worldBboxMaxX?: number | null;
  worldBboxMaxY?: number | null;
  svgFlipY?: boolean;
  isActive?: boolean;
  layers: PlantViewLayer[];
}

export interface FloorplanUpsertPayload {
  plantId: string;
  code: string;
  name: string;
  svgContent: string;
  worldBboxMinX: number;
  worldBboxMinY: number;
  worldBboxMaxX: number;
  worldBboxMaxY: number;
  svgFlipY?: boolean;
  displayOrder?: number | null;
  isActive?: boolean;
}
