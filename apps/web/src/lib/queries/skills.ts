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

import { serverRequest } from '@/lib/api';

const skillKeys = {
  all: ['skills'] as const,
  list: () => [...skillKeys.all, 'list'] as const,
  search: (query: string) => [...skillKeys.all, 'search', query] as const,
};

export const skillsQueryOptions = queryOptions({
  queryKey: skillKeys.list(),
  staleTime: Infinity,
  queryFn: () => serverRequest<Skill[]>('/skills'),
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
    queryFn: () =>
      serverRequest<SkillSearchResult[]>(`/skills/search?q=${encodeURIComponent(debouncedQuery)}`),
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreateInput) =>
      serverRequest<Skill>('/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
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
    mutationFn: ({ name, input }: { name: string; input: SkillUpdateInput }) =>
      serverRequest<Skill>(`/skills/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
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
    mutationFn: (name: string) =>
      serverRequest<void>(`/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),
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
    mutationFn: (input: SkillImportInput) =>
      serverRequest<Skill>('/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all });
      toast.success('Skill imported');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
