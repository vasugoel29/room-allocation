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
                    <h2 className="text-2xl font-bold text-white tracking-tight">Room Analytics</h2>
                    <p className="text-gray-400 text-sm mt-1">Utilization and distribution metrics across the campus</p>
                </div>
                
                <div className="flex bg-[#1A1A1A] p-1 rounded-xl border border-white/[0.05]">
                    {[7, 30, 90].map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${days === d ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
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
                            <div key={i} className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02] shadow-sm space-y-4">
                                <div className="h-8 w-8 bg-white/10 rounded-lg" />
                                <div className="space-y-2">
                                    <div className="h-3 w-28 bg-white/5 rounded" />
                                    <div className="h-8 w-16 bg-white/10 rounded-md" />
                                    <div className="h-3 w-32 bg-white/5 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Charts Skeleton */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {[1, 2].map((i) => (
                            <div key={i} className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02] space-y-4">
                                <div className="h-5 w-40 bg-white/10 rounded" />
                                <div className="h-[300px] bg-white/5 rounded-xl flex items-end justify-between p-6">
                                    {[40, 60, 30, 80, 50, 70, 45, 90, 65].map((h, idx) => (
                                        <div key={idx} className="w-6 bg-white/10 rounded-t" style={{ height: `${h}%` }} />
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
                    { label: 'Overall Utilization', value: `${(data.summary?.utilization_percent || 0).toFixed(1)}%`, sub: 'Average across all rooms', icon: TrendingUp, color: 'text-blue-400' },
                    { label: 'Total Bookings', value: data.summary?.booking_count || 0, sub: `In the last ${days} days`, icon: Calendar, color: 'text-emerald-400' },
                    { label: 'Active Rooms', value: data.summary?.room_count || 0, sub: 'Currently in registry', icon: Activity, color: 'text-amber-400' }
                ].map((stat, i) => (
                    <div key={i} className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02] shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-2 rounded-lg bg-black/40 ${stat.color}`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                        </div>
                        <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">{stat.label}</h3>
                        <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                        <p className="text-gray-600 text-[10px] mt-1 font-medium">{stat.sub}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Daily Trend */}
                <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02]">
                    <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        Booking Influx
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailyTrends}>
                                <defs>
                                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#555" 
                                    fontSize={10} 
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                />
                                <YAxis stroke="#555" fontSize={10} />
                                <Tooltip 
                                    contentStyle={{ background: '#111', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#fff' }}
                                    labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                />
                                <Area type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorTrend)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Rooms */}
                <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02]">
                    <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" />
                        High Demand Rooms
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.topRooms} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                                <XAxis type="number" stroke="#555" fontSize={10} />
                                <YAxis dataKey="name" type="category" stroke="#555" fontSize={10} width={80} />
                                <Tooltip 
                                    cursor={{fill: '#ffffff05'}}
                                    contentStyle={{ background: '#111', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                                />
                                <Bar dataKey="booking_count" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Peak Hours */}
                <div className="bg-[#1A1A1A] p-6 rounded-2xl border border-white/[0.02] lg:col-span-2">
                    <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-500" />
                        Hourly Distribution
                    </h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.peakHours}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis 
                                    dataKey="hour" 
                                    stroke="#555" 
                                    fontSize={10} 
                                    tickFormatter={(h) => `${h}:00`}
                                />
                                <YAxis stroke="#555" fontSize={10} />
                                <Tooltip 
                                    cursor={{fill: '#ffffff05'}}
                                    contentStyle={{ background: '#111', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                                    labelFormatter={(h) => `${h}:00 - ${parseInt(h)+1}:00`}
                                />
                                <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
            </div>
            </>
            )}
        </div>
    );
};

export default AdminAnalytics;
