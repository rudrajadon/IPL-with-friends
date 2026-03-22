import React, { useState } from "react";

const CreateRoomModal = ({ teams, createRoom, closeModal, account }) => {
  const [teamId, setTeamId] = useState("");
  const canCreate = Boolean(account?.playerId && teamId);

  const handleCreateRoom = () => {
    if (account?.playerId && teamId) {
      createRoom({ playerId: account.playerId, teamId });
    }
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="modal-pop bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-300">
        <div className="p-6 border-b border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Create New Room</h2>
            <button
              onClick={closeModal}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Become the admin of your own auction.
          </p>
        </div>
        <div className="p-6 space-y-4" style={{ minHeight: "284px" }}>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Logged in as
            </label>
            <div className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white">
              {account?.username || "Not logged in"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Select Your Team
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>
                Choose a franchise
              </option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-gray-700 flex justify-end space-x-4">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateRoom}
            disabled={!canCreate}
            className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateRoomModal;
