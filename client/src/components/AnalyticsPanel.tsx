import { trpc } from "@/lib/trpc";
import { formatBrl } from "@/lib/money";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell
} from "recharts";

export default function AnalyticsPanel() {
  const { data: analytics = [], isLoading } = trpc.months.getAnalytics.useQuery();

  if (isLoading) {
    return <div className="text-center py-10 text-gray-400 font-mono text-sm">Carregando análises...</div>;
  }

  if (analytics.length === 0) {
    return (
      <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/50">
        <p className="text-sm font-mono text-gray-400">Nenhum dado disponível para análise.</p>
        <p className="text-xs font-mono text-gray-500 mt-1">Crie alguns meses e adicione despesas para ver os gráficos.</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded shadow-xl">
          <p className="text-white font-mono text-xs mb-2 border-b border-border pb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-[10px] font-mono" style={{ color: entry.color }}>
              {entry.name}: {formatBrl(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Receitas vs Despesas */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-6">Receitas vs Despesas</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => val.split('-').reverse().join('/')} 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans" 
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans"
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Plus Jakarta Sans', paddingTop: '10px' }} />
                <Bar dataKey="totalIncome" name="Receitas" fill="#00f0ff" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="totalExpense" name="Despesas" fill="#ff3333" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Evolução do Saldo Acumulado */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-6">Evolução do Saldo Acumulado</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCarryover" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#39ff14" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#39ff14" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => val.split('-').reverse().join('/')} 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans" 
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans"
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Plus Jakarta Sans', paddingTop: '10px' }} />
                <Area 
                  type="monotone" 
                  dataKey="finalCarryover" 
                  name="Saldo Fim do Mês" 
                  stroke="#39ff14" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorCarryover)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lucro/Prejuízo Mensal (Surplus) */}
        <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2">
          <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-6">Sobra Mensal (Lucro/Prejuízo do Mês Isolado)</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tickFormatter={(val) => val.split('-').reverse().join('/')} 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans" 
                  tickMargin={10}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={10} 
                  fontFamily="Plus Jakarta Sans"
                  tickFormatter={(val) => `R$ ${val / 1000}k`}
                  width={60}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'Plus Jakarta Sans', paddingTop: '10px' }} />
                <Bar dataKey="surplus" name="Sobra do Mês">
                  {analytics.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.surplus >= 0 ? '#39ff14' : '#ff3333'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
      </div>
    </div>
  );
}
