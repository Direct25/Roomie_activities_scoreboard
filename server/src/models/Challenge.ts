import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const challengeSchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    challenger: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    opponent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 'points' = most points scored, 'activity' = most times doing one chore.
    metric: { type: String, enum: ['points', 'activity'], required: true },
    activity: { type: Schema.Types.ObjectId, ref: 'Activity', default: null },
    activityName: { type: String, default: '' },
    emoji: { type: String, default: '' },
    days: { type: Number, enum: [1, 3, 7], required: true },
    // Bonus points the winner receives from the app (0 = bragging rights only).
    stakePoints: { type: Number, min: 0, max: 50, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'declined', 'cancelled', 'expired'],
      default: 'pending',
    },
    // A pending invitation lapses at this time if nobody accepts it.
    expiresAt: { type: Date, required: true },
    // Local calendar days (household timezone), set when the opponent accepts.
    startDay: { type: String, default: '' },
    endDay: { type: String, default: '' },
    winner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    challengerScore: { type: Number, default: 0 },
    opponentScore: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type ChallengeDoc = HydratedDocument<InferSchemaType<typeof challengeSchema>>;
export const Challenge = model('Challenge', challengeSchema);
