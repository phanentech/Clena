/** Labels shared by the operations, driver and management screens. */

export const INCIDENT_KINDS: Record<string, { label: string; action: string }> = {
  missing_item: { label: "Missing item", action: "Record incident, investigate tracking history and notify operations. The order is frozen." },
  damaged_item: { label: "Damaged item", action: "Record evidence, photos and assessment; escalate under policy." },
  stain_not_removable: { label: "Stain not removable", action: "Record the condition and manage customer expectations." },
  extra_charge: { label: "Extra charge", action: "Request customer approval before applying the charge." },
  wrong_item: { label: "Wrong item assignment", action: "The order is frozen. Investigate tracking history." },
  delayed: { label: "Delayed processing", action: "Mark at risk and tell the customer." },
  failed_pickup: { label: "Failed pickup", action: "Record the reason and reschedule." },
  failed_delivery: { label: "Failed delivery", action: "Record the reason and reschedule." },
  payment_failure: { label: "Payment failure", action: "Notify the customer and apply the order rule." },
  quality_complaint: { label: "Quality complaint", action: "Review the order, contact the customer, rewash if needed." },
  other: { label: "Other", action: "Describe what happened." },
};

export const FAILED_REASONS: Record<string, string> = {
  customer_unavailable: "Customer not available",
  wrong_address: "Wrong or incomplete address",
  no_access: "Couldn't get access (gate, security)",
  customer_rescheduled: "Customer asked to reschedule",
  refused: "Customer refused",
  unsafe_location: "Unsafe to complete",
  vehicle_issue: "Vehicle problem",
  payment_issue: "Payment problem",
  other: "Other",
};

export const QC_ITEMS: { key: string; label: string }[] = [
  { key: "identity", label: "Order identity and bag reference confirmed" },
  { key: "count_weight", label: "Item count or weight matches the order record" },
  { key: "stains_damage", label: "Inspected for stains, damage and special instructions" },
  { key: "process_complete", label: "Processing completed as per the selected service" },
  { key: "cleanliness", label: "Cleanliness and finishing quality checked" },
  { key: "finishing", label: "Folding, ironing and packaging checked" },
  { key: "tags_present", label: "All tagged items are present" },
  { key: "exceptions_recorded", label: "Any exceptions recorded before release" },
];

export const SEGMENT_LABEL: Record<string, string> = {
  prospect: "No orders yet", new: "New", regular: "Regular", at_risk: "At risk", lapsed: "Lapsed", vip: "VIP",
};

export const JOB_STATUS: Record<string, string> = {
  unassigned: "Unassigned", assigned: "Assigned", en_route: "On the way", completed: "Completed", failed: "Failed", cancelled: "Cancelled",
};

/** Queues of the operations app, in the order work flows. */
export const QUEUES: { key: string; label: string; stages: string[]; countKey: string }[] = [
  { key: "receiving", label: "Receiving", stages: ["picked_up", "pickup_requested"], countKey: "awaiting_receiving" },
  { key: "sorting", label: "Sorting", stages: ["received", "sorting"], countKey: "sorting" },
  { key: "processing", label: "Processing", stages: ["processing", "drying", "finishing"], countKey: "processing" },
  { key: "quality", label: "Quality", stages: ["quality_check"], countKey: "quality" },
  { key: "ready", label: "Ready", stages: ["ready", "out_for_delivery"], countKey: "ready" },
];
