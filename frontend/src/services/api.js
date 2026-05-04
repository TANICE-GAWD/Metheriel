



const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8080";

const DEFAULT_TIMEOUT = 25000; 




async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Analysis timed out. Try a shorter claim segment.");
    }
    throw new Error("Network error. Please check your connection.");
  } finally {
    clearTimeout(id);
  }
}







export async function analyzePatent({ claimText, targetDate }) {
  if (!claimText || claimText.trim().length === 0) {
    throw new Error("Claim text cannot be empty.");
  }

  const payload = {
    claim_text: claimText,
    target_date: targetDate || "",
  };

  let response;

  try {
    response = await fetchWithTimeout(`${API_BASE_URL}/v1/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    
    throw err;
  }

  
  
  
  
  

  if (!response.ok) {
    let message = "Something went wrong during analysis.";

    try {
      const errorData = await response.text();

      if (response.status === 400) {
        message = "Invalid input. Please check your claim text.";
      } else if (response.status === 500) {
        message = "Server error. Try again in a moment.";
      }

      
      console.error("Backend error:", errorData);
    } catch {
      
    }

    throw new Error(message);
  }

  
  
  
  
  

  const data = await response.json();

  const normalized = {
    keywords: data.keywords || {},
    results: data.results || [],
    status: "success",
  };

  
  if (!normalized.results.length) {
    normalized.status = "no_results";
  }

  return normalized;
}







export async function getDetailedAnalysis({
  patentText,
  priorArtText,
}) {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/v1/analyze-detailed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patent_text: patentText,
          prior_art_text: priorArtText,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to generate detailed analysis.");
    }

    return await response.json();
  } catch (err) {
    throw new Error(
      err.message || "Unable to fetch detailed analysis."
    );
  }
}