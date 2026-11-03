import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const householdSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    code: { type: String, required: true, unique: true, uppercase: true },
    // The weekly reset happens at local midnight on Monday in this timezone.
    timezone: { type: String, required: true, default: 'UTC' },
    // The owner: the person who created the household, or whoever inherited it.
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Weekly prize in rupees for 1st, 2nd and 3rd place. The pot is shared equally
    // by everyone in the household, so winners are paid by the rest.
    prizesEnabled: { type: Boolean, default: true },
    prizes: { type: [Number], default: [25, 25, 25] },
    // First ISO week (e.g. "2026-W45") that prizes apply to. Weeks before it are never settled.
    prizesFrom: { type: String, default: '' },
  },
  { timestamps: true },
);

export type HouseholdDoc = HydratedDocument<InferSchemaType<typeof householdSchema>>;
export const Household = model('Household', householdSchema);
