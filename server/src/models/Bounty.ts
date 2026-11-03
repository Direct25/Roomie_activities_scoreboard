import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const bountySchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    activity: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    activityName: { type: String, required: true },
    emoji: { type: String, required: true },
    // Extra points for the first roommate to do the chore (never the person who posted it).
    bonusPoints: { type: Number, required: true, min: 1, max: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['open', 'claimed', 'cancelled', 'expired'], default: 'open' },
    claimedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export type BountyDoc = HydratedDocument<InferSchemaType<typeof bountySchema>>;
export const Bounty = model('Bounty', bountySchema);
