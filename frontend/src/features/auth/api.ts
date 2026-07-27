import {
  apiClient,
  clearAccessToken,
  storeAccessToken,
} from "../../lib/apiClient";

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_platform_admin: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export async function login(email: string, password: string) {
  const response = await apiClient.post<LoginResponse>("/auth/login", {
    email,
    password,
  });
  storeAccessToken(response.access_token);
  return response;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiClient.get<CurrentUser>("/auth/me");
}

export function logout(): void {
  clearAccessToken();
}
