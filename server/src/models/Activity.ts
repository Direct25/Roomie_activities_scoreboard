import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const activitySchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    emoji: { type: String, required: true, default: '✨', maxlength: 16 },
    points: { type: Number, required: true, min: 1, max: 100 },
    // Archived instead of deleted so past entries keep making sense.
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type ActivityDoc = HydratedDocument<InferSchemaType<typeof activitySchema>>;
export const Activity = model('Activity', activitySchema);

export const DEFAULT_ACTIVITIES = [
  { emoji: '🍽️', name: 'Wash the dishes', points: 10 },
  { emoji: '🗑️', name: 'Take out the trash', points: 5 },
  { emoji: '🍳', name: 'Cook for everyone', points: 20 },
  { emoji: '🧽', name: 'Clean the kitchen', points: 20 },
  { emoji: '🚽', name: 'Clean the bathroom', points: 30 },
  { emoji: '🧹', name: 'Sweep and mop', points: 15 },
  { emoji: '🛒', name: 'Groceries run', points: 15 },
  { emoji: '🧺', name: 'Shared laundry', points: 10 },
];
