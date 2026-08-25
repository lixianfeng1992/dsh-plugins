declare module '@deepseek-ai/dsh-client-runtime/client' { export type ClientContext = any }
declare module '@deepseek-ai/dsh-client-ui-settings/client' {}
declare module '@deepseek-ai/dsh-client-ui-layout/client' {}
declare module '@deepseek-ai/dsh-client-ui-sidebar/client' {}
declare module 'lucide-react/dist/esm/icons/*.js' {
  const Icon: import('react').ForwardRefExoticComponent<
    Omit<import('react').SVGProps<SVGSVGElement>, 'ref'>
    & import('react').RefAttributes<SVGSVGElement>
    & { size?: number | string }
  >
  export default Icon
}
