export const inventionStatuses = ['idea', 'prototype', 'complete'] as const;

export type InventionStatus = (typeof inventionStatuses)[number];

export type Invention = {
  id: number | string;
  title: string;
  description: string;
  status: InventionStatus;
  created_at: string;
  updated_at: string;
};

export type InventionDraft = Pick<Invention, 'title' | 'description'>;
