Please optimize the backend to not load all submissions upon request, only do 50 at a time with pages. 
Make the frontend for submissions be an infinite scroll but load 50 at a time (by modifying the backend).

Add a new table in the db called "pbs" that stores each players pbs, that automatically gets updated upon a submission. 

Modify the calculator so that you can view a certain players scores. 

Add a page to view a players "profile" (/players/[uuid]) that shows their name, score, when they joined, and the calculator with their times submitted automatically. Anywhere a player's name is visible, make it clickable and open their profile page in a new tab.

Create a new way to compare times, where you can select a user and it will load all their scores and show times and score (not district). and you can select a different user and compare it to their times as well (side by side).

Create a leaderboard page that lets you filter by overall or by trial and it will show the order of all ranked players based on their overall score or score for that trial. Highlight times on the leaderboard that are the world record.



For the below methods, do not actually implement the calling of the webhook, just create the methods that are called by the backend that will later be used for this purpose.

Begin adding methods in lib that are called whenever somebody over a score of 0.3 has an approved run (which will later be used to send a webhook message to the discord), make sure it groups bulk submissions together.
Add a separate method that handles wr runs that are approved, that will send a webhook message in the discord.
people's usernames in the discord will need to be updated every time a score change happens, add a method to handle this.

MOST IMPORTANTLY: Optimize everything for loading speed, try to get data as fast as possible, without worrying about accuracy, get the accurate data in the background, and update the website to show accurate data as soon as its received. Use caching.
