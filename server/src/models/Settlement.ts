import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const payoutSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rank: { type: Number, required: true },
    prizePaise: { type: Number, required: true },
  },
  { _id: false },
);

const balanceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prizePaise: { type: Number, required: true },
    sharePaise: { type: Number, required: true },
    netPaise: { type: Number, required: true },
  },
  { _id: false },
);

const transferSchema = new Schema({
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amountPaise: { type: Number, required: true },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  paidMarkedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

// A finished week's prize results, created once and never recalculated, so
// changing the prize amounts later can't rewrite what people already owe.
const settlementSchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true },
    weekKey: { type: String, required: true },
    prizes: { type: [Number], default: [] },
    memberCount: { type: Number, required: true },
    payouts: { type: [payoutSchema], default: [] },
    balances: { type: [balanceSchema], default: [] },
    transfers: { type: [transferSchema], default: [] },
  },
  { timestamps: true },
);

settlementSchema.index({ household: 1, weekKey: 1 }, { unique: true });

export type SettlementDoc = HydratedDocument<InferSchemaType<typeof settlementSchema>>;
export const Settlement = model('Settlement', settlementSchema);
