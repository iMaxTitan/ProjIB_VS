/**
 * Teams bot — type definitions.
 */

export type UserRole = 'employee' | 'head' | 'chief' | 'analyst' | 'kb_user';

/** Teams channel fields — now stored in user_profiles */
export interface TeamsUser {
  user_id: string;
  teams_aad_oid: string;
  teams_conversation_id: string | null;
  teams_service_url: string | null;
  teams_is_active: boolean;
}

export interface TeamsUserProfile {
  user_id: string;
  full_name: string | null;
  role: UserRole;
  department_id: string | null;
  status: string;
}

export interface ResolvedTeamsUser {
  teamsUser: TeamsUser;
  profile: TeamsUserProfile;
}
