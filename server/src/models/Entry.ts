import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const entrySchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Null for system entries such as challenge winnings.
    activity: { type: Schema.Types.ObjectId, ref: 'Activity', default: null },
    // 'chore' = a logged activity. 'bonus' = points awarded by the app (a challenge win):
    // they add to the score but are not chores, so they don't count toward streaks or chore totals.
    kind: { type: String, enum: ['chore', 'bonus'], default: 'chore' },
    // Snapshot of the activity at logging time, so later edits never rewrite history.
    activityName: { type: String, required: true },
    emoji: { type: String, required: true },
    // Includes any bounty bonus on top of the activity's base points.
    points: { type: Number, required: true },
    bonusPoints: { type: Number, default: 0 },
    bounty: { type: Schema.Types.ObjectId, ref: 'Bounty', default: null },
    challenge: { type: Schema.Types.ObjectId, ref: 'Challenge', default: null },
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
