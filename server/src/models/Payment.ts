import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** "I received this much from that roommate", recorded by the person who got paid. */
const paymentSchema = new Schema(
  {
    household: { type: Schema.Types.ObjectId, ref: 'Household', required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paise: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const Payment = model('Payment', paymentSchema);
