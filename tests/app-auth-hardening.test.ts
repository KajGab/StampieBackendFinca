import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Härtung der App-Anmeldung:
 *
 *  - Logout macht den Token auf dem Server ungültig, nicht nur auf dem Gerät.
 *  - Ein Login mit Start-Passwort darf nichts tun außer das Passwort ändern.
 *  - Passwort ändern verlangt das aktuelle Passwort und meldet alle anderen Geräte ab.
 */

const sessionFindUnique = vi.fn()
const sessionDeleteMany = vi.fn()
const userFindUnique = vi.fn()
const userUpdate = vi.fn()
const transaction = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    appSession: {
      findUnique: (...a: unknown[]) => sessionFindUnique(...a),
      deleteMany: (...a: unknown[]) => sessionDeleteMany(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}))

const rateLimitAllowed = vi.fn(() => true)
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: rateLimitAllowed(), remaining: 1, resetAt: 0 }),
}))

import { requireAppUser, requireAppUserAllowingPendingPassword } from '@/lib/auth/app-session'
import { hashPassword } from '@/lib/auth/password'

const { POST: logout } = await import('@/app/api/app/logout/route')
const { POST: changePassword } = await import('@/app/api/app/change-password/route')
const { GET: me } = await import('@/app/api/app/me/route')

const req = (path: string, token: string | null, body?: unknown) =>
  new Request(`https://backend.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

function session(mustChangePassword: boolean) {
  return {
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: 'u1',
      username: 'kellner',
      name: 'Finca',
      mustChangePassword,
      memberships: [{ orgId: 'org-1', role: 'OWNER', org: { name: 'Finca' } }],
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitAllowed.mockReturnValue(true)
  sessionDeleteMany.mockResolvedValue({ count: 1 })
  userUpdate.mockResolvedValue({})
  transaction.mockResolvedValue([])
})

describe('requireAppUser — Start-Passwort', () => {
  it('lässt einen Login mit geändertem Passwort durch', async () => {
    sessionFindUnique.mockResolvedValue(session(false))
    await expect(requireAppUser(req('/api/app/cards', 'tok'))).resolves.toMatchObject({
      userId: 'u1',
    })
  })

  it('weist einen Login ab, der noch das Start-Passwort hat', async () => {
    sessionFindUnique.mockResolvedValue(session(true))
    await expect(requireAppUser(req('/api/app/cards', 'tok'))).resolves.toBeNull()
  })

  it('die Ausnahme für me/change-password lässt ihn durch', async () => {
    sessionFindUnique.mockResolvedValue(session(true))
    await expect(
      requireAppUserAllowingPendingPassword(req('/api/app/me', 'tok')),
    ).resolves.toMatchObject({ mustChangePassword: true })
  })

  it('/api/app/me meldet die Pflicht zum Ändern, statt 401 zu antworten', async () => {
    sessionFindUnique.mockResolvedValue(session(true))
    const res = await me(req('/api/app/me', 'tok'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mustChangePassword: true })
  })
})

describe('POST /api/app/logout', () => {
  it('löscht genau den mitgeschickten Token', async () => {
    const res = await logout(req('/api/app/logout', 'tok-123', {}))
    expect(res.status).toBe(200)
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { token: 'tok-123' } })
  })

  it('antwortet ohne Token trotzdem 200 und löscht nichts', async () => {
    const res = await logout(req('/api/app/logout', null, {}))
    expect(res.status).toBe(200)
    expect(sessionDeleteMany).not.toHaveBeenCalled()
  })

  it('fasst keine Dashboard-Sitzung an', async () => {
    const res = await logout(req('/api/app/logout', 'dash_abc', {}))
    expect(res.status).toBe(200)
    expect(sessionDeleteMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/app/change-password', () => {
  beforeEach(async () => {
    sessionFindUnique.mockResolvedValue(session(true))
    userFindUnique.mockResolvedValue({ passwordHash: await hashPassword('start-pw-123') })
  })

  it('ohne Anmeldung: 401', async () => {
    sessionFindUnique.mockResolvedValue(null)
    const res = await changePassword(
      req('/api/app/change-password', 'tok', { currentPassword: 'x', newPassword: 'neues-pw-123' }),
    )
    expect(res.status).toBe(401)
  })

  it('verlangt das aktuelle Passwort', async () => {
    const res = await changePassword(
      req('/api/app/change-password', 'tok', { newPassword: 'neues-pw-123' }),
    )
    expect(res.status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('lehnt ein falsches aktuelles Passwort ab und ändert nichts', async () => {
    const res = await changePassword(
      req('/api/app/change-password', 'tok', {
        currentPassword: 'geraten',
        newPassword: 'neues-pw-123',
      }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'wrong_password' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('lehnt ein neues Passwort ab, das dem alten gleicht', async () => {
    const res = await changePassword(
      req('/api/app/change-password', 'tok', {
        currentPassword: 'start-pw-123',
        newPassword: 'start-pw-123',
      }),
    )
    expect(res.status).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('bremst nach zu vielen Versuchen', async () => {
    rateLimitAllowed.mockReturnValue(false)
    const res = await changePassword(
      req('/api/app/change-password', 'tok', {
        currentPassword: 'start-pw-123',
        newPassword: 'neues-pw-123',
      }),
    )
    expect(res.status).toBe(429)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('ändert das Passwort und meldet alle anderen Geräte ab', async () => {
    const res = await changePassword(
      req('/api/app/change-password', 'tok-dieses-geraet', {
        currentPassword: 'start-pw-123',
        newPassword: 'neues-pw-123',
      }),
    )
    expect(res.status).toBe(200)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ mustChangePassword: false }),
      }),
    )
    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', token: { not: 'tok-dieses-geraet' } },
    })
  })
})
