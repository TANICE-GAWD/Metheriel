import { useState } from "react";
import "./SearchBar.css";


const SAMPLE_CLAIM = `A method for placing an order for an item via a network, comprising:
displaying information identifying the item and a purchase option;
receiving a single action input indicating a request to purchase the item;
and in response to the single action input, automatically completing the order without requiring additional user input.`;

export default function SearchBar({ onSearch, loading }) {
  const [claimText, setClaimText] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  const charCount = claimText.length;

  
  
  

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!claimText.trim()) {
      setError("Please enter a valid patent claim.");
      return;
    }

    setError("");

    onSearch({
      claimText,
      targetDate,
    });
  };

  
  
  

  const handleSample = () => {
    setClaimText(SAMPLE_CLAIM);
  };

  return (
    <div className="searchbar-container">

      <form onSubmit={handleSubmit}>

        {/* TEXTAREA */}
        <div className="input-group">
          <textarea
            placeholder="Paste your patent claim here..."
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            rows={6}
            className="search-textarea"
          />

          <div className="input-meta">
            <span>{charCount} characters</span>
          </div>
        </div>

        {/* DATE INPUT */}
        <div className="date-section">
          <label>
            Filing Date (Prior Art Cutoff)
          </label>

          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />

          <small className="hint-text">
            Only results published before this date will be considered prior art.
          </small>
        </div>

        {/* ACTION ROW */}
        <div className="action-row">

          <button
            type="button"
            className="secondary-btn"
            onClick={handleSample}
          >
            Sample Claim
          </button>

          <button
            type="submit"
            className="button-primary"
            disabled={loading}
          >
            {loading ? "Processing..." : "Run Analysis"}
          </button>

        </div>

        {/* ERROR */}
        {error && (
          <div className="error-text">
            {error}
          </div>
        )}

      </form>
    </div>
  );
}