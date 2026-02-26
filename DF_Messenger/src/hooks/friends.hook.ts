import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { friendsApi } from '../api';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const friendsQueryKeys = {
  search: (q: string) => ['friends', 'search', q] as const,
  list: ['friends', 'list'] as const,
  mutual: (targetId: number) => ['friends', 'mutual', targetId] as const,
  status: (targetId: number) => ['friends', 'status', targetId] as const,
  sentRequests: ['friends', 'requests', 'sent'] as const,
  receivedRequests: ['friends', 'requests', 'received'] as const,
  requestsCount: ['friends', 'requests', 'count'] as const,
  blockedList: ['friends', 'blocked'] as const,
};

// ─── useSearchUsers ───────────────────────────────────────────────────────────

export const useSearchUsers = (q: string, skip = 0) => {
  return useQuery({
    queryKey: friendsQueryKeys.search(q),
    queryFn: () => friendsApi.search(q, skip),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
};

// ─── useFriends ───────────────────────────────────────────────────────────────

export const useFriends = () => {
  return useQuery({
    queryKey: friendsQueryKeys.list,
    queryFn: friendsApi.getFriends,
    staleTime: 60_000,
  });
};

// ─── useRemoveFriend ─────────────────────────────────────────────────────────

export const useRemoveFriend = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendId: number) => friendsApi.removeFriend(friendId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    },
  });
};

// ─── useRelationshipStatus ───────────────────────────────────────────────────

export const useRelationshipStatus = (targetId: number) => {
  return useQuery({
    queryKey: friendsQueryKeys.status(targetId),
    queryFn: () => friendsApi.getStatus(targetId),
    staleTime: 30_000,
    enabled: !!targetId,
  });
};

// ─── useMutualFriends ────────────────────────────────────────────────────────

export const useMutualFriends = (targetId: number) => {
  return useQuery({
    queryKey: friendsQueryKeys.mutual(targetId),
    queryFn: () => friendsApi.getMutual(targetId),
    staleTime: 60_000,
    enabled: !!targetId,
  });
};

// ─── useSendFriendRequest ────────────────────────────────────────────────────

export const useSendFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiverId: number) => friendsApi.sendRequest(receiverId),
    onSuccess: (_, receiverId) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(receiverId) });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.sentRequests });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requestsCount });
    },
  });
};

// ─── useCancelFriendRequest ──────────────────────────────────────────────────

export const useCancelFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId }: { requestId: number; targetId: number }) =>
      friendsApi.cancelRequest(requestId),
    onSuccess: (_, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(targetId) });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.sentRequests });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requestsCount });
    },
  });
};

// ─── useRespondFriendRequest ─────────────────────────────────────────────────

export const useRespondFriendRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      friendshipId,
      action,
    }: {
      friendshipId: number;
      action: 'ACCEPTED' | 'DECLINED';
      targetId: number;
    }) => friendsApi.respondRequest(friendshipId, action),
    onSuccess: (_, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(targetId) });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.receivedRequests });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requestsCount });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    },
  });
};

// ─── useReceivedRequests ─────────────────────────────────────────────────────

export const useReceivedRequests = () => {
  return useQuery({
    queryKey: friendsQueryKeys.receivedRequests,
    queryFn: friendsApi.getReceivedRequests,
    staleTime: 30_000,
  });
};

// ─── useSentRequests ─────────────────────────────────────────────────────────

export const useSentRequests = () => {
  return useQuery({
    queryKey: friendsQueryKeys.sentRequests,
    queryFn: friendsApi.getSentRequests,
    staleTime: 30_000,
  });
};

// ─── useRequestsCount ────────────────────────────────────────────────────────

export const useRequestsCount = () => {
  return useQuery({
    queryKey: friendsQueryKeys.requestsCount,
    queryFn: friendsApi.getRequestsCount,
    staleTime: 30_000,
  });
};

// ─── useBlockUser ────────────────────────────────────────────────────────────

export const useBlockUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: number) => friendsApi.blockUser(blockedId),
    onSuccess: (_, blockedId) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(blockedId) });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.blockedList });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.list });
    },
  });
};

// ─── useUnblockUser ──────────────────────────────────────────────────────────

export const useUnblockUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: number) => friendsApi.unblockUser(blockedId),
    onSuccess: (_, blockedId) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(blockedId) });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.blockedList });
    },
  });
};

// ─── useBlockedList ──────────────────────────────────────────────────────────

export const useBlockedList = () => {
  return useQuery({
    queryKey: friendsQueryKeys.blockedList,
    queryFn: friendsApi.getBlockedList,
    staleTime: 60_000,
  });
};