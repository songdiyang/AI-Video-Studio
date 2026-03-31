/**
 * 团队协作服务层
 * 提供团队管理、成员管理、项目协作者、邀请系统的 API 调用
 */

import { getAuthToken } from './auth';

// =============================================
// 类型定义
// =============================================

export type CollaborationRole = 'viewer' | 'editor' | 'admin' | 'owner';

export interface Team {
  id: number;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: number;
  invite_code: string;
  max_members: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  my_role?: CollaborationRole;
  members_count?: number;
  projects_count?: number;
  owner_username?: string;
  owner_avatar?: string;
}

export interface TeamMember {
  id: number;
  user_id: number;
  role: CollaborationRole;
  joined_at: string;
  username: string;
  avatar: string | null;
  email: string | null;
  invited_by_username?: string;
}

export interface ProjectCollaborator {
  id: number;
  user_id: number;
  role: Exclude<CollaborationRole, 'owner'>;
  added_at: string;
  username: string;
  avatar: string | null;
  email: string | null;
  added_by_username?: string;
}

export interface ProjectOwner {
  user_id: number;
  username: string;
  avatar: string | null;
  email: string | null;
  role: 'owner';
}

export interface CollaborationInvite {
  code: string;
  type: 'team' | 'project';
  target_id?: number;
  target_name: string;
  role: Exclude<CollaborationRole, 'owner'>;
  created_by?: string;
  max_uses?: number;
  expires_at: string;
}

export interface SearchedUser {
  id: number;
  username: string;
  avatar: string | null;
  email: string | null;
}

export interface JoinRequest {
  id: number;
  team_id: number;
  team_name: string;
  user_id: number;
  user_email?: string;
  user_avatar?: string;
  invite_code: string | null;
  inviter_email?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: number;
  reviewer_email?: string;
  reviewed_at: string | null;
  created_at: string;
}

// =============================================
// 工具函数
// =============================================

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `请求失败 (${res.status})`);
  }
  return res.json();
}

// =============================================
// 团队管理 API
// =============================================

export async function createTeam(data: {
  name: string;
  description?: string;
  avatar_url?: string;
}): Promise<{ message: string; team: Team }> {
  const res = await fetch('/api/teams', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchTeams(): Promise<{ teams: Team[] }> {
  const res = await fetch('/api/teams', { headers: authHeaders() });
  return handleResponse(res);
}

export async function fetchTeamDetail(teamId: number): Promise<{ team: Team; myRole: CollaborationRole }> {
  const res = await fetch(`/api/teams/${teamId}`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function updateTeam(
  teamId: number,
  data: { name?: string; description?: string; avatar_url?: string }
): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function deleteTeam(teamId: number): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// =============================================
// 团队成员管理 API
// =============================================

export async function fetchTeamMembers(teamId: number): Promise<{ members: TeamMember[] }> {
  const res = await fetch(`/api/teams/${teamId}/members`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function addTeamMember(
  teamId: number,
  data: { username: string; role?: Exclude<CollaborationRole, 'owner'> }
): Promise<{ message: string; member: { user_id: number; username: string; role: string } }> {
  const res = await fetch(`/api/teams/${teamId}/members`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateTeamMemberRole(
  teamId: number,
  userId: number,
  role: Exclude<CollaborationRole, 'owner'>
): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return handleResponse(res);
}

export async function removeTeamMember(teamId: number, userId: number): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function leaveTeam(teamId: number): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}/leave`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function joinTeam(inviteCode: string): Promise<{ message: string; team: { id: number; name: string } }> {
  const res = await fetch('/api/teams/join', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_code: inviteCode }),
  });
  return handleResponse(res);
}

export async function fetchTeamProjects(teamId: number): Promise<{ projects: any[] }> {
  const res = await fetch(`/api/teams/${teamId}/projects`, { headers: authHeaders() });
  return handleResponse(res);
}

// =============================================
// 项目协作者管理 API
// =============================================

export async function fetchProjectCollaborators(projectId: number): Promise<{
  owner: ProjectOwner;
  collaborators: ProjectCollaborator[];
  team_id: number | null;
  myRole: CollaborationRole;
}> {
  const res = await fetch(`/api/projects/${projectId}/collaborators`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function addProjectCollaborator(
  projectId: number,
  data: { username: string; role?: Exclude<CollaborationRole, 'owner'> }
): Promise<{ message: string; collaborator: { user_id: number; username: string; role: string } }> {
  const res = await fetch(`/api/projects/${projectId}/collaborators`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function updateCollaboratorRole(
  projectId: number,
  userId: number,
  role: Exclude<CollaborationRole, 'owner'>
): Promise<{ message: string }> {
  const res = await fetch(`/api/projects/${projectId}/collaborators/${userId}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return handleResponse(res);
}

export async function removeProjectCollaborator(projectId: number, userId: number): Promise<{ message: string }> {
  const res = await fetch(`/api/projects/${projectId}/collaborators/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// =============================================
// 邀请系统 API
// =============================================

export async function generateInvite(data: {
  type: 'team' | 'project';
  target_id: number;
  role?: Exclude<CollaborationRole, 'owner'>;
  max_uses?: number;
  expires_in_hours?: number;
}): Promise<{ invite: CollaborationInvite }> {
  const res = await fetch('/api/invites/generate', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchInviteDetail(code: string): Promise<{ invite: CollaborationInvite }> {
  const res = await fetch(`/api/invites/${code}`);
  return handleResponse(res);
}

export async function acceptInvite(code: string): Promise<{
  message: string;
  type: 'team' | 'project';
  target_id: number;
  target_name: string;
  role: string;
  status?: 'pending';
}> {
  const res = await fetch(`/api/invites/${code}/accept`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function revokeInvite(code: string): Promise<{ message: string }> {
  const res = await fetch(`/api/invites/${code}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// =============================================
// 团队加入申请审核 API
// =============================================

export async function fetchJoinRequests(
  teamId: number,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<{ requests: JoinRequest[] }> {
  const url = status
    ? `/api/teams/${teamId}/join-requests?status=${status}`
    : `/api/teams/${teamId}/join-requests`;
  const res = await fetch(url, { headers: authHeaders() });
  return handleResponse(res);
}

export async function approveJoinRequest(
  teamId: number,
  requestId: number
): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function rejectJoinRequest(
  teamId: number,
  requestId: number
): Promise<{ message: string }> {
  const res = await fetch(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function fetchMyJoinRequests(): Promise<{ requests: JoinRequest[] }> {
  const res = await fetch('/api/my-join-requests', { headers: authHeaders() });
  return handleResponse(res);
}

// =============================================
// 用户搜索 API
// =============================================

export async function searchUsers(query: string): Promise<{ users: SearchedUser[] }> {
  if (query.length < 2) {
    return { users: [] };
  }
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders(),
  });
  return handleResponse(res);
}

// =============================================
// 工具函数
// =============================================

export const ROLE_LABELS: Record<CollaborationRole, string> = {
  viewer: '查看者',
  editor: '编辑者',
  admin: '管理员',
  owner: '所有者',
};

export const ROLE_DESCRIPTIONS: Record<CollaborationRole, string> = {
  viewer: '只能查看内容，不能编辑',
  editor: '可以编辑内容，不能管理成员',
  admin: '可以编辑内容和管理成员',
  owner: '完全控制权限',
};

export function canManageMembers(role: CollaborationRole | null | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export function canEdit(role: CollaborationRole | null | undefined): boolean {
  return role === 'editor' || role === 'admin' || role === 'owner';
}

export function canDelete(role: CollaborationRole | null | undefined): boolean {
  return role === 'owner';
}

export function generateInviteLink(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}
