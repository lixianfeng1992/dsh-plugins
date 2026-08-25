import path from 'node:path'

export interface RepositoryRef { url: string; name: string }

export function parseRepositoryUrl(input: string): RepositoryRef {
  let parsed: URL
  try { parsed = new URL(input) } catch { throw new Error('repository URL must be a valid HTTPS URL') }
  if (parsed.protocol !== 'https:') throw new Error('repository URL must use HTTPS')
  if (!['github.com', 'gitlab.com'].includes(parsed.hostname.toLowerCase())) throw new Error('repository URL must point to GitHub or GitLab')
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('repository URL must include an owner and repository name')
  const rawName = parts.at(-1)!.replace(/\.git$/, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rawName) || rawName === '.' || rawName === '..') throw new Error('repository name is unsafe')
  return { url: parsed.toString().replace(/\/$/, ''), name: rawName }
}

export function repositoryPaths(dshHome: string, profile: string, ref: RepositoryRef) {
  const base = path.resolve(dshHome, 'skill-hub', 'repos')
  const checkout = path.resolve(base, `${profile}-${ref.name}`)
  if (checkout !== base && !checkout.startsWith(`${base}${path.sep}`)) throw new Error('derived repository path escapes DSH_HOME')
  return { base, checkout, skills: path.resolve(checkout, 'skills'), links: path.resolve(dshHome, 'skills'), state: path.resolve(dshHome, 'skill-hub', 'state.json') }
}
