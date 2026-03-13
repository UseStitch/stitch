import { useQuery } from '@tanstack/react-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { serverFetch } from '@/lib/api'
import { HardDrive, Check } from 'lucide-react'

export function ServerStatus() {
  const { data: isHealthy } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await serverFetch('/health')
      return res.ok
    },
    refetchInterval: 10_000,
    retry: false,
  })

  return (
    <Popover>
      <PopoverTrigger
        className="relative flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted/50 transition-colors"
        aria-label="Server status"
      >
        <HardDrive className="w-3.75 h-3.75 text-muted-foreground" />
        <div
          className={`absolute top-1 right-1 w-2 h-2 rounded-full border-[1.5px] border-background transition-colors ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}
        />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-70 p-0 rounded-xl overflow-hidden shadow-lg border-border">
        {/* Header Tab */}
        <div className="flex items-center gap-5 text-[13px] px-4 pt-3 border-b border-border bg-muted/30">
          <div className="pb-2.5 border-b-2 border-primary text-foreground font-medium cursor-default">
            Servers
          </div>
        </div>
        
        {/* Servers List */}
        <div className="flex flex-col p-4 gap-4 bg-popover">
          {/* Local Server Item */}
          <div className="flex items-center justify-between group cursor-default">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full shrink-0 ${isHealthy ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
              <div className="flex items-baseline gap-2">
                <span className={`text-[13px] ${isHealthy ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Local Server</span>
              </div>
            </div>
            {isHealthy && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
