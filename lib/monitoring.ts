import * as cheerio from "cheerio";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * Deep compare two JSON-LD objects and return structured changes
 */
function compareJsonLd(
  oldJsonLd: any,
  newJsonLd: any
): Array<{ field: string; old: string | null; new: string | null; category: string }> {
  const changes: Array<{ field: string; old: string | null; new: string | null; category: string }> = [];

  // Handle null/undefined cases
  if (!oldJsonLd && !newJsonLd) {
    return changes;
  }
  if (!oldJsonLd && newJsonLd) {
    changes.push({
      field: "Schema: Added",
      old: null,
      new: JSON.stringify(newJsonLd, null, 2),
      category: "Schema",
    });
    return changes;
  }
  if (oldJsonLd && !newJsonLd) {
    changes.push({
      field: "Schema: Removed",
      old: JSON.stringify(oldJsonLd, null, 2),
      new: null,
      category: "Schema",
    });
    return changes;
  }

  // Normalize to arrays for comparison
  const oldArray = Array.isArray(oldJsonLd) ? oldJsonLd : [oldJsonLd];
  const newArray = Array.isArray(newJsonLd) ? newJsonLd : [newJsonLd];

  // Compare each schema object
  const maxLength = Math.max(oldArray.length, newArray.length);
  for (let i = 0; i < maxLength; i++) {
    const oldItem = oldArray[i];
    const newItem = newArray[i];

    if (!oldItem && newItem) {
      changes.push({
        field: `Schema: Added (${newItem["@type"] || "Unknown"})`,
        old: null,
        new: JSON.stringify(newItem, null, 2),
        category: "Schema",
      });
      continue;
    }
    if (oldItem && !newItem) {
      changes.push({
        field: `Schema: Removed (${oldItem["@type"] || "Unknown"})`,
        old: JSON.stringify(oldItem, null, 2),
        new: null,
        category: "Schema",
      });
      continue;
    }

    // Compare properties within the same schema object
    const allKeys = new Set([
      ...Object.keys(oldItem || {}),
      ...Object.keys(newItem || {}),
    ]);

    for (const key of allKeys) {
      // Skip @context as it's usually the same
      if (key === "@context") continue;

      const oldValue = oldItem[key];
      const newValue = newItem[key];

      // Deep comparison
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const schemaType = oldItem["@type"] || newItem["@type"] || "Schema";
        const fieldName = key
          .split(/(?=[A-Z])/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        changes.push({
          field: `Schema: ${schemaType} - ${fieldName}`,
          old: formatJsonLdValue(oldValue),
          new: formatJsonLdValue(newValue),
          category: "Schema",
        });
      }
    }
  }

  return changes;
}

/**
 * Format JSON-LD value for display
 */
function formatJsonLdValue(value: any): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatJsonLdValue(v)).join(", ");
  }
  if (typeof value === "object") {
    // For nested objects, show key-value pairs
    const entries = Object.entries(value)
      .slice(0, 3) // Limit to first 3 properties
      .map(([k, v]) => `${k}: ${formatJsonLdValue(v)}`);
    const suffix = Object.keys(value).length > 3 ? "..." : "";
    return `{${entries.join(", ")}${suffix}}`;
  }
  return String(value);
}

export interface ParsedData {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonical: string | null;
  metaRobots: string | null;
  jsonLd: any | null;
}

/**
 * Fetch and parse a URL to extract SEO metadata
 */
export async function fetchAndParse(url: string): Promise<ParsedData> {
  try {
    const response = await fetch(url, {
      headers: {
       "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      },
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
      next: { revalidate: 0 } // Ensure Next.js doesn't cache the old result
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title = $("title").first().text().trim() || null;

    // Extract meta description
    const metaDescription =
      $('meta[name="description"]').attr("content")?.trim() || null;

    // Extract H1
    const h1 = $("h1").first().text().trim() || null;

    // Extract canonical
    const canonical =
      $('link[rel="canonical"]').attr("href")?.trim() || null;

    // Extract meta robots
    const metaRobots =
      $('meta[name="robots"]').attr("content")?.trim() || null;

    // Extract JSON-LD schema - handle multiple script tags
    let jsonLd: any = null;
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const parsedJsonLd: any[] = [];
    let parseErrors: string[] = [];

    if (jsonLdScripts.length > 0) {
      // Process all JSON-LD script tags
      jsonLdScripts.each((index, element) => {
        try {
          const jsonLdText = $(element).html();
          if (jsonLdText && jsonLdText.trim()) {
            try {
              const parsed = JSON.parse(jsonLdText);
              parsedJsonLd.push(parsed);
            } catch (parseError) {
              // Silently skip malformed JSON-LD - only log if all fail
              const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
              parseErrors.push(`Script ${index + 1}: ${errorMsg}`);
            }
          }
        } catch (e) {
          // Error extracting JSON-LD text - silently skip
          const errorMsg = e instanceof Error ? e.message : String(e);
          parseErrors.push(`Script ${index + 1} (extraction): ${errorMsg}`);
        }
      });

      // Only log if all tags failed to parse
      if (parsedJsonLd.length === 0 && parseErrors.length > 0) {
        console.warn(`Failed to parse all JSON-LD scripts from ${url}: ${parseErrors.join('; ')}`);
      }

      // Set jsonLd based on what was successfully parsed
      if (parsedJsonLd.length === 1) {
        jsonLd = parsedJsonLd[0];
      } else if (parsedJsonLd.length > 1) {
        // Multiple valid JSON-LD objects - combine into array
        jsonLd = parsedJsonLd;
      }
      // If parsedJsonLd.length === 0, jsonLd remains null
    }

    return {
      title,
      metaDescription,
      h1,
      canonical,
      metaRobots,
      jsonLd,
    };
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

/**
 * Recursively sort object keys to create canonical JSON representation
 * This prevents false positives from key order differences
 */
function canonicalStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return `[${obj.map(item => canonicalStringify(item)).join(",")}]`;
  }
  
  // Sort keys and recursively stringify values
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, any> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  
  // Recursively canonicalize nested objects
  for (const key of sortedKeys) {
    if (typeof sortedObj[key] === "object" && sortedObj[key] !== null && !Array.isArray(sortedObj[key])) {
      sortedObj[key] = JSON.parse(canonicalStringify(sortedObj[key]));
    } else if (Array.isArray(sortedObj[key])) {
      sortedObj[key] = sortedObj[key].map((item: any) => 
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? JSON.parse(canonicalStringify(item))
          : item
      );
    }
  }
  
  return JSON.stringify(sortedObj);
}

/**
 * Compute SHA-256 hash of parsed data using canonical JSON
 */
export function computeHash(data: ParsedData): string {
  const dataString = canonicalStringify(data);
  return createHash("sha256").update(dataString).digest("hex");
}

/**
 * Check a URL for changes by comparing current state with latest snapshot
 * @param urlId - The URL ID to check
 * @param projectId - The project ID
 * @param isInitialCheck - If true, only create baseline snapshot, don't create change logs
 */
export async function checkUrl(
  urlId: string,
  projectId: string,
  isInitialCheck: boolean = false
): Promise<{ changed: boolean; error?: string; url?: string; changes?: Array<{ field: string; old: string | null; new: string | null; category: string }> }> {
  const supabase = await createClient();

  try {
    // Get the URL record
    const { data: urlRecord, error: urlError } = await supabase
      .from("urls")
      .select("url")
      .eq("id", urlId)
      .single();

    if (urlError || !urlRecord) {
      return { changed: false, error: "URL not found" };
    }

    // Fetch and parse the live page
    const currentData = await fetchAndParse(urlRecord.url);
    const currentHash = computeHash(currentData);

    console.log(`[checkUrl] URL: ${urlRecord.url} | ID: ${urlId}`);
    console.log(`[checkUrl] Hash: ${currentHash}`);

    // Get the latest snapshot for this URL
    const { data: latestSnapshot, error: snapshotError } = await supabase
      .from("url_snapshots")
      .select("hash, data")
      .eq("url_id", urlId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshotError && snapshotError.code !== "PGRST116") {
      console.error("[checkUrl] Error fetching snapshot:", snapshotError);
      return { changed: false, error: "Failed to fetch snapshot" };
    }

    if (!latestSnapshot) {
      console.log(`[checkUrl] No previous snapshot - creating baseline`);
    } else {
      console.log(`[checkUrl] Previous hash: ${latestSnapshot.hash}`);
    }

    // Declare changes array at function scope so it's accessible in both branches
    interface StructuredChange {
      field: string;
      old: string | null;
      new: string | null;
      category: string;
    }
    let changes: StructuredChange[] = [];

    // If no snapshot exists or hash is different, create new snapshot
    if (!latestSnapshot || latestSnapshot.hash !== currentHash) {
      // Insert new snapshot
      const { error: insertError } = await supabase
        .from("url_snapshots")
        .insert({
          url_id: urlId,
          hash: currentHash,
          data: currentData,
        });

      if (insertError) {
        console.error("[checkUrl] Error inserting snapshot:", insertError);
        return { changed: false, error: "Failed to save snapshot" };
      }

      // Create a system log if there was a previous snapshot (meaning something changed)
      // Skip log creation if this is an initial check (baseline only)
      if (latestSnapshot && !isInitialCheck) {
        // Compare to find what changed - use structured format
        changes = [];
        const oldData = latestSnapshot.data as ParsedData;

        console.log(`[checkUrl] Comparing snapshots...`);

        // On-Page changes
        if (oldData.title !== currentData.title) {
          changes.push({
            field: "Title",
            old: oldData.title || null,
            new: currentData.title || null,
            category: "On-Page",
          });
        }
        if (oldData.metaDescription !== currentData.metaDescription) {
          changes.push({
            field: "Meta Description",
            old: oldData.metaDescription || null,
            new: currentData.metaDescription || null,
            category: "On-Page",
          });
        }
        if (oldData.h1 !== currentData.h1) {
          changes.push({
            field: "H1",
            old: oldData.h1 || null,
            new: currentData.h1 || null,
            category: "On-Page",
          });
        }

        // Technical changes
        if (oldData.canonical !== currentData.canonical) {
          changes.push({
            field: "Canonical URL",
            old: oldData.canonical || null,
            new: currentData.canonical || null,
            category: "Technical",
          });
        }
        if (oldData.metaRobots !== currentData.metaRobots) {
          changes.push({
            field: "Meta Robots",
            old: oldData.metaRobots || null,
            new: currentData.metaRobots || null,
            category: "Technical",
          });
        }

        // Deep JSON-LD comparison using canonical stringify
        // Handle null/undefined jsonLd gracefully
        const oldJsonLd = oldData.jsonLd ?? null;
        const newJsonLd = currentData.jsonLd ?? null;
        
        // Only compare if at least one is not null
        if (oldJsonLd !== null || newJsonLd !== null) {
          try {
            // Use canonical stringify to avoid false positives from key order
            const oldJsonLdStr = oldJsonLd === null ? "null" : canonicalStringify(oldJsonLd);
            const newJsonLdStr = newJsonLd === null ? "null" : canonicalStringify(newJsonLd);
            
            if (oldJsonLdStr !== newJsonLdStr) {
              const jsonLdChanges = compareJsonLd(oldJsonLd, newJsonLd);
              changes.push(...jsonLdChanges);
            }
          } catch (compareError) {
            // If comparison fails, log but don't crash
            console.warn("[checkUrl] Error comparing JSON-LD:", compareError instanceof Error ? compareError.message : String(compareError));
            // Still record a change if one exists and the other doesn't
            if (oldJsonLd === null && newJsonLd !== null) {
              changes.push({
                field: "Schema: Added",
                old: null,
                new: "JSON-LD detected (parsing failed)",
                category: "Schema",
              });
            } else if (oldJsonLd !== null && newJsonLd === null) {
              changes.push({
                field: "Schema: Removed",
                old: "JSON-LD was present",
                new: null,
                category: "Schema",
              });
            }
          }
        }

        console.log(`[checkUrl] ✓ Detected ${changes.length} change(s)`);

        if (changes.length > 0) {
          // Helper to escape quotes in strings for storage
          const escapeForStorage = (str: string | null): string => {
            if (str === null) return "(empty)";
            // Replace quotes with escaped quotes, but keep it readable
            return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
          };

          // Convert structured changes to string format for storage
          // Format: "Field: \"old\" → \"new\""
          const changesStrings = changes.map((change) => {
            if (change.old === null && change.new === null) {
              return `${change.field} changed`;
            }
            const oldStr = escapeForStorage(change.old);
            const newStr = escapeForStorage(change.new);
            return `${change.field}: "${oldStr}" → "${newStr}"`;
          });

          // Determine primary category (use most common or Technical as default)
          const categoryCounts: Record<string, number> = {};
          changes.forEach((change) => {
            categoryCounts[change.category] = (categoryCounts[change.category] || 0) + 1;
          });
          const primaryCategory =
            Object.keys(categoryCounts).reduce((a, b) =>
              categoryCounts[a] > categoryCounts[b] ? a : b
            ) || "Technical";

          // Create system log with URL link
          // Generate UUID for public_id to ensure unique IDs for historical linking
          const publicId = randomUUID();
          const { data: newLog, error: logError } = await supabase
            .from("logs")
            .insert({
              public_id: publicId,
              project_id: projectId,
              title: "URL Content Changed",
              description: `Changes detected on ${urlRecord.url}`,
              category: primaryCategory,
              source: "system",
              changes: changesStrings,
            })
            .select("id, public_id")
            .single();

          // Link the log to the URL using the numeric id
          if (!logError && newLog) {
            await supabase.from("log_urls").insert({
              log_id: newLog.id,
              url_id: urlId,
            });
          }

          if (logError) {
            console.error("[checkUrl] Error creating system log:", logError);
          } else {
            console.log(`[checkUrl] ✓ Log created: ${changes.length} field(s) changed`);
          }
        } else {
          console.log(`[checkUrl] ⚠️ Hash changed but no field differences - possible data structure issue`);
        }
      } else {
        // First snapshot - create initial log only if not an initial check
        // (Initial checks are for baseline snapshots, so we skip the "Monitoring Started" log)
        if (!isInitialCheck) {
          console.log(`[checkUrl] Creating initial monitoring log`);
          // Generate UUID for public_id to ensure unique IDs for historical linking
          const publicId = randomUUID();
          const { error: logError } = await supabase
            .from("logs")
            .insert({
              public_id: publicId,
              project_id: projectId,
              title: "URL Monitoring Started",
              description: `Started monitoring ${urlRecord.url}`,
              category: "Technical",
              source: "system",
            })
            .select("id, public_id")
            .single();

          if (logError) {
            console.error("[checkUrl] Error creating initial log:", logError);
          }
        }
      }

      // Return true only if changes were actually detected (had previous snapshot and found differences)
      const hasChanges = !!latestSnapshot && !isInitialCheck && changes.length > 0;
      console.log(`[checkUrl] Result: ${hasChanges ? 'CHANGED' : 'NO CHANGE'} (snapshot: ${!!latestSnapshot}, changes: ${changes.length})`);
      return { 
        changed: hasChanges,
        url: urlRecord.url,
        changes: hasChanges ? changes : undefined
      };
    } else {
      // Hash matches - but we should still do a field-by-field comparison to catch edge cases
      console.log(`[checkUrl] Hash matches - verifying with field comparison...`);
      
      const oldData = latestSnapshot.data as ParsedData;
      
      // Force field-by-field comparison even when hash matches
      // This catches edge cases where hash might match but content actually changed
      changes = [];

      // Field comparison happens below

      // On-Page changes
      if (oldData.title !== currentData.title) {
        changes.push({
          field: "Title",
          old: oldData.title || null,
          new: currentData.title || null,
          category: "On-Page",
        });
      }
      if (oldData.metaDescription !== currentData.metaDescription) {
        changes.push({
          field: "Meta Description",
          old: oldData.metaDescription || null,
          new: currentData.metaDescription || null,
          category: "On-Page",
        });
      }
      if (oldData.h1 !== currentData.h1) {
        changes.push({
          field: "H1",
          old: oldData.h1 || null,
          new: currentData.h1 || null,
          category: "On-Page",
        });
      }

      // Technical changes
      if (oldData.canonical !== currentData.canonical) {
        changes.push({
          field: "Canonical URL",
          old: oldData.canonical || null,
          new: currentData.canonical || null,
          category: "Technical",
        });
      }
      if (oldData.metaRobots !== currentData.metaRobots) {
        changes.push({
          field: "Meta Robots",
          old: oldData.metaRobots || null,
          new: currentData.metaRobots || null,
          category: "Technical",
        });
      }

      // Deep JSON-LD comparison using canonical stringify
      const oldJsonLd = oldData.jsonLd ?? null;
      const newJsonLd = currentData.jsonLd ?? null;
      
      if (oldJsonLd !== null || newJsonLd !== null) {
        try {
          // Use canonical stringify to avoid false positives from key order
          const oldJsonLdStr = oldJsonLd === null ? "null" : canonicalStringify(oldJsonLd);
          const newJsonLdStr = newJsonLd === null ? "null" : canonicalStringify(newJsonLd);
          
          if (oldJsonLdStr !== newJsonLdStr) {
            const jsonLdChanges = compareJsonLd(oldJsonLd, newJsonLd);
            changes.push(...jsonLdChanges);
          }
        } catch (compareError) {
          console.warn("[checkUrl] Error comparing JSON-LD when hash matched:", compareError instanceof Error ? compareError.message : String(compareError));
        }
      }

      if (changes.length > 0) {
        console.log(`[checkUrl] 🚨 CRITICAL: Hash matched but ${changes.length} field difference(s) found!`);
        
        // Create snapshot and log even though hash matched
        const { error: insertError } = await supabase
          .from("url_snapshots")
          .insert({
            url_id: urlId,
            hash: currentHash,
            data: currentData,
          });

        if (insertError) {
          console.error("[checkUrl] Error inserting snapshot after hash collision detection:", insertError);
        } else {
          // Create log for the changes
          const escapeForStorage = (str: string | null): string => {
            if (str === null) return "(empty)";
            return str.replace(/"/g, '\\"').replace(/\n/g, "\\n");
          };

          const changesStrings = changes.map((change) => {
            if (change.old === null && change.new === null) {
              return `${change.field} changed`;
            }
            const oldStr = escapeForStorage(change.old);
            const newStr = escapeForStorage(change.new);
            return `${change.field}: "${oldStr}" → "${newStr}"`;
          });

          const categoryCounts: Record<string, number> = {};
          changes.forEach((change) => {
            categoryCounts[change.category] = (categoryCounts[change.category] || 0) + 1;
          });
          const primaryCategory =
            Object.keys(categoryCounts).reduce((a, b) =>
              categoryCounts[a] > categoryCounts[b] ? a : b
            ) || "Technical";

          const publicId = randomUUID();
          const { data: newLog, error: logError } = await supabase
            .from("logs")
            .insert({
              public_id: publicId,
              project_id: projectId,
              title: "URL Content Changed",
              description: `Changes detected on ${urlRecord.url} (hash collision detected)`,
              category: primaryCategory,
              source: "system",
              changes: changesStrings,
            })
            .select("id, public_id")
            .single();

          if (!logError && newLog) {
            await supabase.from("log_urls").insert({
              log_id: newLog.id,
              url_id: urlId,
            });
          }

          if (logError) {
            console.error("[checkUrl] Error creating log for hash collision:", logError);
          }
        }

        // Update last_checked_at
        const { error: updateError } = await supabase
          .from("monitor_urls")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("url_id", urlId);

        if (updateError) {
          console.error("[checkUrl] Error updating last_checked_at:", updateError);
        }

        return { 
          changed: true,
          url: urlRecord.url,
          changes: changes
        };
      }

      // Hash matches and no field differences - truly no changes
      console.log(`[checkUrl] ✓ No changes confirmed`);
      
      // Update last_checked_at in monitor_urls
      const { error: updateError } = await supabase
        .from("monitor_urls")
        .update({ last_checked_at: new Date().toISOString() })
        .eq("url_id", urlId);

      if (updateError) {
        console.error("[checkUrl] Error updating last_checked_at:", updateError);
      }

      return { 
        changed: false,
        url: urlRecord.url
      };
    }
  } catch (error) {
    console.error("Error in checkUrl:", error);
    return {
      changed: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

