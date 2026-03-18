Quick Live Share guide

1. Install the recommended extensions in VS Code:
   - Live Share (ms-vsliveshare.vsliveshare)

2. Start the dev server with host exposure:
   - In VS Code: Run "Terminal > Run Task..." and choose "Start Vite (host)"
   - Or run locally: npm run dev -- --host

   This allows Vite to bind to 0.0.0.0 so remote participants can access forwarded ports.

3. Start Live Share:
   - Click the Live Share button (bottom-left) and choose "Share".
   - Copy the link and send to collaborators.

4. Forward the dev server port (usually 5173) in Live Share:
   - Live Share auto-forwards detected ports, or use the Live Share panel -> Port Forwarding -> Add port 5173.
   - Guests will open the forwarded port URL (VS Code will show the URL).

5. Tips:
   - Put large images in public/images and use simple filenames (no spaces).
   - If Vite or the host machine runs out of memory, reduce image sizes or close other heavy apps.
   - Restart your dev server after .env or other config changes.

That's it — collaborators will join the Live Share session and can preview the app using the forwarded Vite port.
