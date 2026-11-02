import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const householdSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    code: { type: String, required: true, unique: true, uppercase: true },
    // The weekly reset happens at local midnight on Monday in this timezone.
    timezone: { type: String, required: true, default: 'UTC' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export type HouseholdDoc = HydratedDocument<InferSchemaType<typeof householdSchema>>;
export const Household = model('Household', householdSchema);
