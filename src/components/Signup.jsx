

import React, { useState } from "react";


const Signup = () => {
  const [form, setForm] = useState({
    name: "",
    studentId: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");
  // Admin credentials for registration (hardcoded for demo, replace with secure method in production)
  const adminEmail = "Admin@nsut.ac.in";
  const adminPassword = "adminpass"; // Set this to your real admin password

  // Minimalist dark theme styling with TailwindCSS
  const inputClass =
    "w-full px-4 py-2 rounded bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-500";
  const labelClass = "block mb-1 text-gray-300";
  const errorClass = "text-red-500 text-xs mt-1";

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = "Name is required.";
    if (!form.studentId.trim()) newErrors.studentId = "Student ID is required.";
    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(form.email)
    ) {
      newErrors.email = "Invalid email format.";
    }
    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }
    return newErrors;
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("");
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) {
      try {
        const res = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail,
            adminPassword,
            email: form.email,
            password: form.password
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus("Registration successful! You can now log in.");
          setForm({ name: "", studentId: "", email: "", password: "" });
        } else {
          setStatus(data.error || "Registration failed");
        }
      } catch (err) {
        setStatus("Network error");
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md flex justify-end mb-2">
        <button
          onClick={handleLogout}
          className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded font-semibold"
        >
          Logout
        </button>
      </div>
      <form
        className="bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md"
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        <h2 className="text-2xl font-semibold text-gray-100 mb-6 text-center">
          Sign Up
        </h2>
        <div className="mb-4">
          <label className={labelClass} htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            className={inputClass}
            value={form.name}
            onChange={handleChange}
            autoComplete="off"
            placeholder="Enter your name"
          />
          {errors.name && <div className={errorClass}>{errors.name}</div>}
        </div>
        <div className="mb-4">
          <label className={labelClass} htmlFor="studentId">
            Student ID
          </label>
          <input
            id="studentId"
            name="studentId"
            type="text"
            className={inputClass}
            value={form.studentId}
            onChange={handleChange}
            autoComplete="off"
            placeholder="Enter your student ID"
          />
          {errors.studentId && (
            <div className={errorClass}>{errors.studentId}</div>
          )}
        </div>
        <div className="mb-4">
          <label className={labelClass} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className={inputClass}
            value={form.email}
            onChange={handleChange}
            autoComplete="off"
            placeholder="Enter your email"
          />
          {errors.email && <div className={errorClass}>{errors.email}</div>}
        </div>
        <div className="mb-6">
          <label className={labelClass} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className={inputClass}
            value={form.password}
            onChange={handleChange}
            autoComplete="off"
            placeholder="Enter your password"
          />
          {errors.password && (
            <div className={errorClass}>{errors.password}</div>
          )}
        </div>
        <button
          type="submit"
          className="w-full py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
        >
          Sign Up
        </button>
        {status && (
          <div className={status.includes("success") ? "text-green-400 text-center mt-4" : "text-red-400 text-center mt-4"}>{status}</div>
        )}
      </form>
    </div>
  );
};

export default Signup;