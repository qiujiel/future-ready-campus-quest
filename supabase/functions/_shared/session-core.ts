export interface StudentSessionTokens {
  accessToken: string;
  refreshToken: string;
}

interface MagicLinkAdminClient {
  auth: {
    admin: {
      generateLink(input: {
        type: "magiclink";
        email: string;
      }): Promise<{
        data: { properties?: { hashed_token?: string } | null };
        error: unknown;
      }>;
    };
  };
}

interface OtpPublicClient {
  auth: {
    verifyOtp(input: {
      token_hash: string;
      type: "email";
    }): Promise<{
      data: {
        session: {
          access_token: string;
          refresh_token: string;
        } | null;
      };
      error: unknown;
    }>;
  };
}

export async function issueInitialStudentSession(
  admin: MagicLinkAdminClient,
  publicClient: OtpPublicClient,
  internalEmail: string,
): Promise<StudentSessionTokens> {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: internalEmail,
  });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) throw new Error("AUTH_LINK_FAILED");

  const verified = await publicClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  const session = verified.data.session;
  if (verified.error || !session) throw new Error("AUTH_SESSION_FAILED");
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}
