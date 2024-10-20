import type { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser
} from '@auth/core/adapters'
import { stripUndefined } from './utils'

export function CelestiaAdapter(
  prisma: PrismaClient | ReturnType<PrismaClient['$extends']>,
  redis: Redis
): Adapter {
  const p = prisma as PrismaClient
  const r = redis as Redis
  return {
    // We need to let Prisma generate the ID because our default UUID is incompatible with MongoDB
    createUser: ({ id, ...data }) => p.user.create(stripUndefined(data)),
    getUser: (id) => p.user.findUnique({ where: { id } }),
    getUserByEmail: (email) => p.user.findUnique({ where: { email } }),
    getUserByAccount: async (provider_providerAccountId) => {
      const account = await p.account.findUnique({
        where: { provider_providerAccountId },
        select: { user: true }
      })
      return (account?.user as AdapterUser) ?? null
    },
    updateUser: ({ id, ...data }) =>
      p.user.update({
        where: { id },
        ...stripUndefined(data)
      }) as Promise<AdapterUser>,
    deleteUser: (id) =>
      p.user.delete({ where: { id } }) as Promise<AdapterUser>,
    linkAccount: (data) =>
      p.account.create({ data }) as unknown as AdapterAccount,
    unlinkAccount: (provider_providerAccountId) =>
      p.account.delete({
        where: { provider_providerAccountId }
      }) as unknown as AdapterAccount,
    // async getSessionAndUser(sessionToken) {
    //   const userAndSession = await p.session.findUnique({
    //     where: { sessionToken },
    //     include: { user: true }
    //   })
    //   if (!userAndSession) return null
    //   const { user, ...session } = userAndSession
    //   return { user, session } as { user: AdapterUser; session: AdapterSession }
    // },
    // createSession: (data) => p.session.create(stripUndefined(data)),
    // updateSession: (data) =>
    //   p.session.update({
    //     where: { sessionToken: data.sessionToken },
    //     ...stripUndefined(data)
    //   }),
    // deleteSession: (sessionToken) =>
    //   p.session.delete({ where: { sessionToken } }),
    getSessionAndUser: async (sessionToken) => {
      const sessionData = await r.get(`session:${sessionToken}`)
      if (!sessionData) return null
      const session = JSON.parse(sessionData) as AdapterSession
      const user = await p.user.findUnique({
        where: { id: session.userId }
      })
      if (!user) return null
      return { session, user } as { user: AdapterUser; session: AdapterSession }
    },
    createSession: async (data) => {
      await r.set(
        `session:${data.sessionToken}`,
        JSON.stringify(data),
        'EX',
        data.expires.getTime() - Date.now() // Set TTL based on session expiration
      )
      return data
    },
    updateSession: async (
      data: Partial<AdapterSession> & Pick<AdapterSession, 'sessionToken'>
    ) => {
      const existingSession = await r.get(`session:${data.sessionToken}`)
      if (!existingSession) {
        throw new Error('Session not found')
      }
      const updatedSession = {
        ...JSON.parse(existingSession),
        ...data // Merge the new data with the existing session data
      }
      // Check if the userId and other mandatory fields are present
      if (!updatedSession.userId) {
        throw new Error('Missing userId in session data')
      }
      await r.set(
        `session:${updatedSession.sessionToken}`,
        JSON.stringify(updatedSession),
        'EX',
        updatedSession.expires.getTime() - Date.now()
      )

      return updatedSession as AdapterSession // Return the complete AdapterSession
    },
    deleteSession: async (sessionToken) => {
      await r.del(`session:${sessionToken}`)
    },
    createVerificationToken: async (data) => {
      const verificationToken = await p.verificationToken.create(
        stripUndefined(data)
      )
      if (verificationToken.id) delete verificationToken.id
      return verificationToken
    },
    useVerificationToken: async (identifier_token) => {
      try {
        const verificationToken = await p.verificationToken.delete({
          where: { identifier_token }
        })
        if (verificationToken.id) delete verificationToken.id
        return verificationToken
      } catch (error) {
        // If token already used/deleted, just return null
        // https://www.prisma.io/docs/reference/api-reference/error-reference#p2025
        if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2025')
          return null
        throw error
      }
    },
    getAccount: async (providerAccountId, provider) => {
      return p.account.findFirst({
        where: { providerAccountId, provider }
      }) as Promise<AdapterAccount | null>
    },
    createAuthenticator: async (data) => {
      return p.authenticator.create(stripUndefined(data))
    },
    getAuthenticator: async (credentialID) => {
      return p.authenticator.findUnique({
        where: { credentialID }
      })
    },
    listAuthenticatorsByUserId: async (userId) => {
      return p.authenticator.findMany({
        where: { userId }
      })
    },
    updateAuthenticatorCounter: async (credentialID, counter) => {
      return p.authenticator.update({
        where: { credentialID },
        data: { counter }
      })
    }
  }
}
