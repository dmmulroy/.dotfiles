export interface ModelLike {
  id?: string;
  name?: string;
  provider?: string;
}

export function getModelDisplayName(model: ModelLike | undefined, fallback: string): string {
  return model?.name || model?.id || fallback;
}

export function getModelProviderName(model: ModelLike | undefined, fallback = "Unknown"): string {
  return model?.provider || fallback;
}
