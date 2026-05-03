export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
  useCases: UseCase[];
}

export interface UseCase {
  id: string;
  name: string;
  description?: string;
  artifacts: UseCaseArtifact[];
  exampleRunId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UseCaseArtifact {
  id: number;
  type: string;
  name: string;
  status?: string;
}

export interface FavoriteItem {
  artifactId: number;
  type: string;
  name: string;
  addedAt: Date;
}
