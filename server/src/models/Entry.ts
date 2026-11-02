import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const entrySchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    activity: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    // Snapshot of the activity at logging time, so later edits never rewrite history.
    activityName: { type: String, required: true },
    emoji: { type: String, required: true },
    points: { type: Number, required: true },
    note: { type: String, trim: true, maxlength: 120, default: '' },
    // A roommate can dispute an entry; disputed entries don't count until reinstated.
    status: { type: String, enum: ['counted', 'disputed'], default: 'counted' },
    disputedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Local calendar date and ISO week in the household's timezone at logging time.
    dayKey: { type: String, required: true },
    weekKey: { type: String, required: true },
  },
  { timestamps: true },
);

entrySchema.index({ household: 1, createdAt: -1 });
entrySchema.index({ household: 1, weekKey: 1 });

export type EntryDoc = HydratedDocument<InferSchemaType<typeof entrySchema>>;
export const Entry = model('Entry', entrySchema);
