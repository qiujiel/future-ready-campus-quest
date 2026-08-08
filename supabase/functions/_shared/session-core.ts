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
        data: {
          properties?: { hashed_token?: string } | null;
          user?: { id?: string } | null;
        };
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

export interface InitialStudentIdentity {
  studentId: string;
  internalEmail: string;
  initialTokenHash: string;
}

export async function createInitialStudentIdentity(
  admin: MagicLinkAdminClient,
  internalEmail: string,
): Promise<InitialStudentIdentity> {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: internalEmail,
  });
  const tokenHash = link.data.properties?.hashed_token;
  const studentId = link.data.user?.id;
  if (link.error || !tokenHash || !studentId) {
    throw new Error("AUTH_CREATE_FAILED");
  }
  return {
    studentId,
    internalEmail,
    initialTokenHash: tokenHash,
  };
}

export async function exchangeInitialStudentSession(
  publicClient: OtpPublicClient,
  tokenHash: string,
): Promise<StudentSessionTokens> {
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

export async function issueInitialStudentSession(
  admin: MagicLinkAdminClient,
  publicClient: OtpPublicClient,
  internalEmail: string,
): Promise<StudentSessionTokens> {
  const identity = await createInitialStudentIdentity(admin, internalEmail);
  return exchangeInitialStudentSession(
    publicClient,
    identity.initialTokenHash,
  );
}
