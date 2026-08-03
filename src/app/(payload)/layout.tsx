import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import config from '@payload-config'

import { importMap } from './admin/importMap'

import '@payloadcms/next/css'

/**
 * Payload's admin panel gets its own root layout, separate from the site's.
 * Route groups let both exist without a shared parent, which is what keeps the
 * cosmos canvas and the site fonts out of the CMS entirely.
 */

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

export default function Layout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  )
}
