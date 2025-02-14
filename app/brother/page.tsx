"use client"
import { useState, type FormEvent } from "react"

export default function BrotherForm() {
  const [links, setLinks] = useState<{ [key: string]: string }>({})
  const [message, setMessage] = useState<string>("")

  const handleLinkChange = (key: string, value: string) => {
    setLinks((prevLinks) => ({ ...prevLinks, [key]: value }))
  }

  const addLink = () => {
    setLinks((prevLinks) => ({ ...prevLinks, "": "" }))
  }

  const removeLink = (keyToRemove: string) => {
    setLinks((prevLinks) => {
      const newLinks = { ...prevLinks }
      delete newLinks[keyToRemove]
      return newLinks
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage("")

    const form = e.currentTarget
    const formData = new FormData(form)

    formData.append("links", JSON.stringify(links))

    try {
      const response = await fetch("/api/brother", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        setMessage(result.message)
        form.reset()
        setLinks({})
      } else {
        const error = await response.json()
        setMessage(error.error || "An error occurred")
      }
    } catch (error) {
      setMessage("An error occurred while submitting the form")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 bg-white shadow-md rounded-lg pt-32">
      <h2 className="text-2xl font-bold mb-6 text-center">Brother Information</h2>

      {message && (
        <div
          className={`mb-4 p-2 rounded ${message.includes("error") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="f_name" className="block text-sm font-medium text-gray-700">
            First Name
          </label>
          <input
            type="text"
            id="f_name"
            name="f_name"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
        <div>
          <label htmlFor="l_name" className="block text-sm font-medium text-gray-700">
            Last Name
          </label>
          <input
            type="text"
            id="l_name"
            name="l_name"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="majors" className="block text-sm font-medium text-gray-700">
          Majors
        </label>
        <input
          type="text"
          id="majors"
          name="majors"
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="grad_year" className="block text-sm font-medium text-gray-700">
            Graduation Year
          </label>
          <input
            type="number"
            id="grad_year"
            name="grad_year"
            required
            min={2000}
            max={2100}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
        <div>
          <label htmlFor="little" className="block text-sm font-medium text-gray-700">
            Little Brother (ID)
          </label>
          <input
            type="number"
            id="little"
            name="little"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        ></textarea>
      </div>

      <div className="mb-4">
        <label htmlFor="committees" className="block text-sm font-medium text-gray-700">
          Committees
        </label>
        <input
          type="text"
          id="committees"
          name="committees"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="is_officer" className="block text-sm font-medium text-gray-700">
            Is Officer
          </label>
          <select
            id="is_officer"
            name="is_officer"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <div>
          <label htmlFor="hometown" className="block text-sm font-medium text-gray-700">
            Hometown
          </label>
          <input
            type="text"
            id="hometown"
            name="hometown"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
      </div>

      <div className="mb-4">
        <label htmlFor="resume" className="block text-sm font-medium text-gray-700">
          Resume
        </label>
        <input
          type="file"
          id="resume"
          name="resume"
          accept=".pdf,.doc,.docx"
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Links</label>
        {Object.entries(links).map(([key, value], index) => (
          <div key={index} className="flex mb-2">
            <input
              type="text"
              placeholder="Key"
              value={key}
              onChange={(e) => handleLinkChange(e.target.value, value)}
              className="mr-2 w-1/3 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
            <input
              type="url"
              placeholder="URL"
              value={value}
              onChange={(e) => handleLinkChange(key, e.target.value)}
              className="mr-2 w-2/3 rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
            <button
              type="button"
              onClick={() => removeLink(key)}
              className="px-2 py-1 bg-red-500 text-white rounded-md"
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={addLink} className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-md">
          Add Link
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="profile_pic" className="block text-sm font-medium text-gray-700">
          Profile Picture
        </label>
        <input
          type="file"
          id="profile_pic"
          name="profile_pic"
          accept="image/*"
          className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <input
            type="text"
            id="status"
            name="status"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
        <div>
          <label htmlFor="is_admin" className="block text-sm font-medium text-gray-700">
            Is Admin
          </label>
          <select
            id="is_admin"
            name="is_admin"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="submit"
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Submit
        </button>
      </div>
    </form>
  )
}


