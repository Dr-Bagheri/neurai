import configPromise from '@payload-config'
import { getPayload } from 'payload'

/**
 * Server-side Payload client.
 *
 * `getPayload` memoises per config, so calling this from every RSC is cheap —
 * it does not open a new connection per request. Using the local API rather
 * than fetching our own REST endpoints avoids an HTTP round trip to ourselves
 * and keeps access control running in-process.
 */
export const getPayloadClient = async () => getPayload({ config: configPromise })
