import * as React from 'react';
import { toast } from 'sonner';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Skill,
  SkillCreateInput,
  SkillImportInput,
  SkillSearchResult,
  SkillUpdateInput,
} from '@stitch/shared/skills/types';

import { serverFetch } from '@/lib/api';

const skillKeys = {
  all: ['skills'] as const,
  list: () => [...skillKeys.all, 'list'] as const,
  search: (query: string) => [...skillKeys.all, 'search', query] as const,
};

export const skillsQueryOptions = queryOptions({
  queryKey: skillKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<Skill[]> => {
    const res = await serverFetch('/skills');
    if (!res.ok) throw new Error('Failed to fetch skills');
    return res.json() as Promise<Skill[]>;
  },
});

export function useSearchSkills(query: string) {
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = React.useState(trimmedQuery);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(trimmedQuery), 300);
    return () => clearTimeout(id);
  }, [trimmedQuery]);

  return useQuery({
    queryKey: skillKeys.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    queryFn: async (): Promise<SkillSearchResult[]> => {
      const res = await serverFetch(`/skills/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw await parseError(res, 'Failed to search skills');
      return res.json() as Promise<SkillSearchResult[]>;
    },
  });
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? fallback);
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SkillCreateInput) => {
      const res = await serverFetch('/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await parseError(res, 'Failed to create skill');
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      toast.success('Skill created');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, input }: { name: string; input: SkillUpdateInput }) => {
      const res = await serverFetch(`/skills/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await parseError(res, 'Failed to update skill');
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      toast.success('Skill saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await serverFetch(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) throw await parseError(res, 'Failed to delete skill');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      toast.success('Skill deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useImportSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SkillImportInput) => {
      const res = await serverFetch('/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw await parseError(res, 'Failed to import skill');
      return res.json() as Promise<Skill>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      toast.success('Skill imported');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
