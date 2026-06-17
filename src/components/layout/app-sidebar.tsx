import { Link, useLocation } from 'react-router-dom'
import { FileSearch, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import logoUrl from '@/assets/f206e7ab-cff2-40e2-84e4-8cfaa32ecd1f-2869e.png'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

const items = [
  {
    title: 'Análise PRN',
    url: '/analise-prn',
    icon: Activity,
  },
  {
    title: 'Análise de Duplicidade',
    url: '/analise-duplicidade',
    icon: FileSearch,
  },
]

export function AppSidebar() {
  const location = useLocation()
  const { state } = useSidebar()

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className="bg-white border-r border-gray-200 text-gray-800 shadow-sm transition-all duration-300"
    >
      <SidebarHeader className="h-16 flex flex-row items-center border-b border-gray-200 px-4">
        <div className="flex items-center gap-3 font-semibold text-gray-800 overflow-hidden">
          <img
            src={logoUrl}
            alt="PRN Financeiro Logo"
            className="h-8 w-8 shrink-0 object-contain drop-shadow-sm"
          />
          {state === 'expanded' && (
            <span className="truncate text-gray-800 text-lg tracking-tight">PRN Financeiro</span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-gray-400">Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    tooltip={item.title}
                    className={cn(
                      'text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors',
                      location.pathname === item.url && 'text-blue-600 bg-blue-50 hover:bg-blue-50 hover:text-blue-600',
                    )}
                  >
                    <Link to={item.url}>
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
