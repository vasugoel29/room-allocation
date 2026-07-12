import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { TrendingUp, Users, Calendar, Activity, Loader2 } from 'lucide-react';

const AdminAnalytics = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const result = await adminService.fetchAnalytics(days);
                setData(result);
            } catch {
                toast.error('Failed to load analytics');
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [days]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary tracking-tight font-display">Room Analytics</h2>
                    <p className="text-text-secondary text-sm mt-1">Utilization and distribution metrics across the campus</p>
                </div>
                
                <div className="flex bg-surface-low p-1 rounded-xl border border-border/15">
                    {[7, 30, 90].map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${days === d ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                        >
                            {d === 7 ? '1 Week' : d === 30 ? '1 Month' : '3 Months'}
                        </button>
                    ))}
                </div>
            </header>

            {loading ? (
                <div className="space-y-8 animate-pulse">
                    {/* Quick Stats Skeleton */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-surface-low p-6 rounded-2xl border border-border/10 shadow-sm space-y-4">
                                <div className="h-8 w-8 bg-surface-highest/20 rounded-lg" />
                                <div className="space-y-2">
                                    <div className="h-3 w-28 bg-surface-highest/10 rounded" />
                                    <div className="h-8 w-16 bg-surface-highest/20 rounded-md" />
                                    <div className="h-3 w-32 bg-surface-highest/10 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Charts Skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {[1, 2].map((i) => (
                            <div key={i} className="bg-surface-low p-6 rounded-2xl border border-border/10 space-y-4">
                                <div className="h-5 w-40 bg-surface-highest/20 rounded" />
                                <div className="h-[300px] bg-surface-highest/10 rounded-xl flex items-end justify-between p-6">
                                    {[40, 60, 30, 80, 50, 70, 45, 90, 65].map((h, idx) => (
                                        <div key={idx} className="w-6 bg-surface-highest/20 rounded-t" style={{ height: `${h}%` }} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : !data ? null : (
                <>


            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Overall Utilization', value: `${(data.summary?.utilization_percent || 0).toFixed(1)}%`, sub: 'Average across all rooms', icon: TrendingUp, color: 'text-primary' },
                    { label: 'Total Bookings', value: data.summary?.booking_count || 0, sub: `In the last ${days} days`, icon: Calendar, color: 'text-secondary' },
                    { label: 'Active Rooms', value: data.summary?.room_count || 0, sub: 'Currently in registry', icon: Activity, color: 'text-tertiary' }
                ].map((stat, i) => (
                    <div key={i} className="bg-surface-low p-6 rounded-2xl border border-border/15 shadow-sm ring-1 ring-border/5">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-2 rounded-lg bg-tonal-secondary/15 ${stat.color}`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                        </div>
                        <h3 className="text-text-secondary text-xs font-bold capitalize tracking-wider opacity-70">{stat.label}</h3>
                        <p className="text-3xl font-bold text-text-primary mt-1 font-display">{stat.value}</p>
                        <p className="text-text-secondary/60 text-[10px] mt-1 font-medium">{stat.sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Daily Trend */}
                <div className="bg-surface-low p-6 rounded-2xl border border-border/15 ring-1 ring-border/5">
                    <h3 className="text-text-primary font-bold mb-6 flex items-center gap-2 font-display">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        Booking Influx
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyTrends}>
                                <defs>
                                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-high)" opacity={0.3} vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="var(--color-text-secondary)" 
                                    opacity={0.7}
                                    fontSize={10} 
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                />
                                <YAxis stroke="var(--color-text-secondary)" opacity={0.7} fontSize={10} />
                                <Tooltip 
                                    contentStyle={{ background: 'var(--color-surface-low)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                                    itemStyle={{ color: 'var(--color-text-primary)' }}
                                    labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                />
                                <Area type="monotone" dataKey="count" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Rooms */}
                <div className="bg-surface-low p-6 rounded-2xl border border-border/15 ring-1 ring-border/5">
                    <h3 className="text-text-primary font-bold mb-6 flex items-center gap-2 font-display">
                        <Activity className="w-4 h-4 text-secondary" />
                        High Demand Rooms
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.topRooms} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-high)" opacity={0.3} horizontal={false} />
                                <XAxis type="number" stroke="var(--color-text-secondary)" opacity={0.7} fontSize={10} />
                                <YAxis dataKey="name" type="category" stroke="var(--color-text-secondary)" opacity={0.7} fontSize={10} width={80} />
                                <Tooltip 
                                    cursor={{fill: 'var(--color-surface-high)', opacity: 0.15}}
                                    contentStyle={{ background: 'var(--color-surface-low)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                                    itemStyle={{ color: 'var(--color-text-primary)' }}
                                />
                                <Bar dataKey="booking_count" fill="var(--color-secondary)" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Peak Hours */}
                <div className="bg-surface-low p-6 rounded-2xl border border-border/15 ring-1 ring-border/5 lg:col-span-2">
                    <h3 className="text-text-primary font-bold mb-6 flex items-center gap-2 font-display">
                        <Calendar className="w-4 h-4 text-tertiary" />
                        Hourly Distribution
                    </h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.peakHours}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-high)" opacity={0.3} vertical={false} />
                                <XAxis 
                                    dataKey="hour" 
                                    stroke="var(--color-text-secondary)" 
                                    opacity={0.7}
                                    fontSize={10} 
                                    tickFormatter={(h) => `${h}:00`}
                                />
                                <YAxis stroke="var(--color-text-secondary)" opacity={0.7} fontSize={10} />
                                <Tooltip 
                                    cursor={{fill: 'var(--color-surface-high)', opacity: 0.15}}
                                    contentStyle={{ background: 'var(--color-surface-low)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px', fontSize: '12px', color: 'var(--color-text-primary)' }}
                                    itemStyle={{ color: 'var(--color-text-primary)' }}
                                    labelFormatter={(h) => `${h}:00 - ${parseInt(h)+1}:00`}
                                />
                                <Bar dataKey="count" fill="var(--color-tertiary)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            </>
            )}
        </div>
    );
};

export default AdminAnalytics;
