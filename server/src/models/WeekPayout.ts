import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const moneyLine = { _id: false, user: { type: Schema.Types.ObjectId, ref: 'User' }, paise: Number };

/**
 * A finished week's prize result, frozen the first time it is computed so later
 * disputes or prize changes can't rewrite who was paid what.
 */
const payoutSchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
    weekKey: { type: String, required: true },
    prizes: { type: [Number], default: [] },
    pot: { type: Number, default: 0 },
    awards: { type: [moneyLine], default: [] },
    shares: { type: [moneyLine], default: [] },
  },
  { timestamps: true },
);

payoutSchema.index({ household: 1, weekKey: 1 }, { unique: true });

export type WeekPayoutDoc = HydratedDocument<InferSchemaType<typeof payoutSchema>>;
export const WeekPayout = model('WeekPayout', payoutSchema);
