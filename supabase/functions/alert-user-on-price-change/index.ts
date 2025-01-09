import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import axios from "https://cdn.skypack.dev/axios";

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    // Parse the request body
    const { listing_id, api_key } = await req.json();
    if(api_key !== Deno.env.get("API_KEY")){
      return new Response(JSON.stringify({ error: "Invalid API key." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!listing_id) {
      return new Response(JSON.stringify({ error: "Missing listing_id parameter." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch subscribers from auction_favorites
    const { data: favorites, error: favError } = await supabase
      .from("auction_favorites")
      .select("user_id")
      .eq("listing_id", listing_id);

    if (favError) throw favError;

    if (favorites.length === 0) {
      return new Response(JSON.stringify({ message: "No subscribers found for this listing." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Extract user_ids
    const userIds = favorites.map((fav) => fav.user_id);

    // Fetch emails from auth.users
    const { data: users, error: userError } = await supabase
      .from("profiles")
      .select("username")
      .in("user_id", userIds);

    if (userError) throw userError;

    // Fetch car data and latest price from auction_listings
    const { data: listing, error: listingError } = await supabase
      .from("auction_listings")
      .select(`
        title,
        url,
        firstReg,
        mileage,
        fuel,
        transmission,
        engineSize,
        vin,
        color,
        possiblePrice,
        reservedPrice,
        deliveryPrice,
        deliveryWindowStart,
        deliveryWindowEnd
      `)
      .eq("id", listing_id)
      .single();

    if (listingError) throw listingError;

    // Prepare email content
    const emailContent = `
      <h1>Update on Your Favorite Listing: ${listing.title}</h1>
      <p>Check out the latest details:</p>
      <ul>
        <li>Price: €${listing.possiblePrice || "N/A"}</li>
        <li>Reserved Price: €${listing.reservedPrice || "N/A"}</li>
        <li>Delivery Price: €${listing.deliveryPrice || "N/A"}</li>
        <li>Mileage: ${listing.mileage || "N/A"} km</li>
        <li>Fuel: ${listing.fuel || "N/A"}</li>
        <li>Transmission: ${listing.transmission || "N/A"}</li>
        <li>Engine Size: ${listing.engineSize || "N/A"} kW</li>
        <li>VIN: ${listing.vin || "N/A"}</li>
        <li>Color: ${listing.color || "N/A"}</li>
        <li>Registration Date: ${listing.firstReg || "N/A"}</li>
        <li>Delivery Window: ${listing.deliveryWindowStart || "N/A"} to ${listing.deliveryWindowEnd || "N/A"}</li>
      </ul>
      <p>View the listing <a href="${listing.url}">here</a>.</p>
    `;

    // Send emails to all subscribers
    const emailPromises = users.map((user) =>{
      axios({
        method: "post",
        url: "https://api.proemium.si/sendmail",
        headers: {
            token: Deno.env.get("MAIL_API_KEY")!,
            "Content-Type": "application/json",
        },
        data: JSON.stringify({
            to: user.username,
            subject: `Update on Your Favorite Listing: ${listing.title}`,
            html:
            emailContent,
            text:
                emailContent,
        }),
    })
        .then((ress) => {
            return ('OK');
        })
        .catch((e) => {
            console.log(e);
            return (e.response.status);
        });
    }
    );

    await Promise.all(emailPromises);

    return new Response(JSON.stringify({ message: "Emails sent successfully." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending emails:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
