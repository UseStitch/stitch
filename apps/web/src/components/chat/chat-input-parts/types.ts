export type ModelSpec = {
  providerId: string;
  modelId: string;
};

export type Attachment = {
  id: string;
  path: string;
  previewUrl: string | null;
  mime: string;
  filename: string;
};
