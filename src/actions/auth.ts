"use server";

import { createServiceClient } from "@/src/lib/supabase/server";

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
}

export interface SignUpResult {
  success: boolean;
  error?: string;
}

export async function signUpOwner(input: SignUpInput): Promise<SignUpResult> {
  const supabase = await createServiceClient();

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  const userId = authData.user.id;

  // Create organization
  const slug = input.organizationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: input.organizationName, slug })
    .select("id")
    .single();

  if (orgError) {
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: orgError.message };
  }

  // Create profile
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: userId,
      email: input.email,
      full_name: input.fullName,
      role: "owner",
      organization_id: org.id,
    });

  if (profileError) {
    await supabase.from("organizations").delete().eq("id", org.id);
    await supabase.auth.admin.deleteUser(userId);
    return { success: false, error: profileError.message };
  }

  return { success: true };
}
