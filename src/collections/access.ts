import type { Access, PayloadRequest } from 'payload'

/**
 * Shared access helpers.
 *
 * `req.user` is a union of every auth-enabled collection — here `User | Member`
 * — so `role` must be reached through a collection check. Centralising that
 * narrowing means a member can never be mistaken for staff by a forgotten
 * check at an individual call site.
 */

type RequestUser = PayloadRequest['user']

export const isStaff = (user: RequestUser): boolean => user?.collection === 'users'

export const isAdmin = (user: RequestUser): boolean =>
  user?.collection === 'users' && user.role === 'admin'

export const staffOnly: Access = ({ req }) => isStaff(req.user)
export const adminOnly: Access = ({ req }) => isAdmin(req.user)
export const publicRead: Access = () => true
