INSERT INTO pbs (player_uuid, trial_name, submission_uuid, player_name, time, date)
SELECT player_uuid, trial_name, uuid, player_name, time, date
FROM (
    SELECT 
        player_uuid,
        trial_name,
        uuid,
        player_name,
        time,
        date,
        ROW_NUMBER() OVER (
            PARTITION BY player_uuid, trial_name
            ORDER BY time ASC, CAST(date AS INTEGER) ASC, uuid ASC
        ) AS rn
    FROM submissions
    WHERE state = 'approved'
) t
WHERE rn = 1;