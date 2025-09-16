import React, { useEffect, useState } from "react";
import { LogOut, UserPlus, Trash2 } from "lucide-react";

const AdminPanel = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get JWT from localStorage (set on login)
  const token = localStorage.getItem('token');

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/admin/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
      } else {
        setError(data.error || "Failed to fetch users");
      }
    } catch (err) {
      setError("Network error");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (email) => {
    setError("");
    setSuccess("");
    if (!window.confirm(`Delete user ${email}?`)) return;
    try {
      const res = await fetch(`/admin/users/${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("User deleted");
        setUsers(users.filter(u => u.email !== email));
      } else {
        setError(data.error || "Delete failed");
      }
    } catch (err) {
      setError("Network error");
    }
  };

  // State for new user form
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState(1);
  const [section, setSection] = useState(1);
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Create new user handler
  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);
    try {
      // Admin credentials are from JWT, so get admin email from token
      const token = localStorage.getItem('token');
      const payload = token ? JSON.parse(atob(token.split('.')[1])) : {};
      const adminEmail = payload.email;
      // Prompt for admin password for security
      const adminPassword = window.prompt("Enter your admin password to confirm:");
      if (!adminPassword) {
        setCreating(false);
        return;
      }
      // Generate email from branch, year, section
      const email = `${branch}_${year}_${section}@nsut.ac.in`;
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail,
          adminPassword,
          email,
          password: newPassword,
          branch,
          year: parseInt(year, 10),
          section: parseInt(section, 10)
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("User created");
        setUsers([...users, { email }]);
        setNewPassword("");
        setBranch("");
        setYear("");
        setSection("");
      } else {
        setError(data.error || "Failed to create user");
      }
    } catch (err) {
      setError("Network error");
    }
    setCreating(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className="max-w-3xl mx-auto p-8 bg-gray-50 min-h-screen rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800">Admin Panel</h2>
        <button
          onClick={handleLogout}
          className="bg-gray-700 hover:bg-gray-800 text-white px-5 py-2 rounded font-semibold text-base shadow transition-colors flex items-center gap-2"
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
      <form onSubmit={handleCreate} className="mb-10 bg-white p-6 rounded-lg flex flex-col gap-4 shadow border border-gray-200">
        <h3 className="text-xl font-semibold mb-2 text-gray-700">Create New User</h3>
        <div className="flex gap-4">
          <input
            type="text"
            className="flex-1 border border-gray-300 rounded px-3 py-2 bg-gray-100 text-gray-800 focus:outline-none focus:border-blue-500"
            placeholder="Branch (e.g. CSE, IT, ECE)"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            required
          />
          <select
            className="border border-gray-300 rounded px-3 py-2 bg-gray-100 text-gray-800 focus:outline-none focus:border-blue-500"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            required
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
          <select
            className="border border-gray-300 rounded px-3 py-2 bg-gray-100 text-gray-800 focus:outline-none focus:border-blue-500"
            value={section}
            onChange={e => setSection(Number(e.target.value))}
            required
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <input
          type="password"
          className="border border-gray-300 rounded px-3 py-2 bg-gray-100 text-gray-800 focus:outline-none focus:border-blue-500"
          placeholder="Password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
        />
        <div className="text-gray-500 text-sm mb-2">Email will be: {branch && year && section ? `${branch}_${year}_${section}@nsut.ac.in` : '(fill all fields)'}</div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold mt-2 transition-colors flex items-center gap-2"
          disabled={creating}
        >
          <UserPlus size={18} /> {creating ? "Creating..." : "Create User"}
        </button>
      </form>
      {loading ? (
        <div className="text-gray-600 mb-4">Loading users...</div>
      ) : error ? (
        <div className="text-red-500 mb-4">{error}</div>
      ) : (
        <>
          {success && <div className="text-green-500 mb-4">{success}</div>}
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg mb-6 bg-white shadow">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="py-3 px-4 text-left">Email</th>
                  <th className="py-3 px-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.email} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-4 font-mono text-gray-800">{user.email}</td>
                    <td className="py-2 px-4">
                      <button
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded shadow flex items-center gap-1"
                        onClick={() => handleDelete(user.email)}
                        disabled={user.email === "Admin@nsut.ac.in"}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminPanel;
